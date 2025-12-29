import os
import logging
import platform
from datetime import datetime
from dotenv import load_dotenv
import socketio
import time
import threading
from queue import Queue
import subprocess
import json
import sys
from .license import generate_fingerprint, load_license_token, save_license_token, verify_license_locally
import requests

logging.basicConfig(level=logging.INFO)

load_dotenv()
SERVER_URL = os.getenv("SERVER_URL")
AGENT_ID = os.getenv("AGENT_ID", platform.node())
FINGERPRINT = generate_fingerprint()
IS_LICENSED = False


# -----------------------------------------------------------
# SOCKET.IO CLIENT
# -----------------------------------------------------------
sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=0,
    reconnection_delay=3
)

send_queue = Queue()


# -----------------------------------------------------------
# SOCKET EVENTS
# -----------------------------------------------------------
@sio.event
def connect():
    logging.info(f"[🔌] Connected to backend Socket.IO at {SERVER_URL}")

    # ⭐ REGISTER AGENT WITH FINGERPRINT
    try:
        sio.emit("register_agent", {
            "agentId": AGENT_ID,
            "fingerprint": FINGERPRINT
        })
        logging.info(f"[🆔] Registered agent: {AGENT_ID} (FP: {FINGERPRINT[:8]}...)")
    except Exception as e:
        logging.error(f"[❌] Failed to register agent: {e}")

    flush_queue()


@sio.event
def disconnect():
    logging.warning("[⚠️] Disconnected from backend server.")


@sio.on("license_approved")
def on_license_approved(data):
    logging.info(f"[🔓] {data.get('message')}")
    # Trigger activation request now that we know we are approved
    activate_license()

# -----------------------------------------------------------
# LICENSE HANDLERS
# -----------------------------------------------------------
@sio.on("registration_status")
def handle_registration_status(data):
    global IS_LICENSED
    IS_LICENSED = data.get("isLicensed", False)
    
    if IS_LICENSED:
        token = load_license_token()
        valid, msg = verify_license_locally(token, FINGERPRINT)
        if not valid:
            logging.warning(f"[🔑] License token invalid: {msg}. Requesting activation...")
            activate_license()
        else:
            logging.info("[✔️] License verified locally.")
    else:
        logging.warning("[⚠️] Agent not licensed. Requesting activation...")
        activate_license()

def activate_license():
    def on_activation_response(res):
        global IS_LICENSED
        if res.get("success"):
            save_license_token(res["token"])
            IS_LICENSED = True
            logging.info("[✔️] License activated and token saved.")
        else:
            logging.error(f"[❌] License activation failed: {res.get('message')}")

    sio.emit("license_activate", {
        "agentId": AGENT_ID,
        "fingerprint": FINGERPRINT
    }, callback=on_activation_response)


# -----------------------------------------------------------
# ⭐ BOOTSTRAP: AUTO-RESOLVE TENANT KEY
# -----------------------------------------------------------
def bootstrap_license():
    try:
        # 1. Hardware Lookup
        logging.info("[🔍] Attempting zero-touch hardware identification...")
        res = requests.post(f"{SERVER_URL}/api/license/verify-hardware", json={"fingerprint": FINGERPRINT}, timeout=10)
        if res.status_code == 200:
            data = res.json()
            if data.get("success"):
                save_to_env("TENANT_KEY", data["tenantKey"])
                logging.info(f"[✔️] Hardware recognized! Associated with {data['companyName']}")
                return data["tenantKey"]

        # 2. License file
        license_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "license.key")
        if os.path.exists(license_file):
            with open(license_file, "r") as f:
                license_key = f.read().strip()
                if license_key:
                    logging.info(f"[🔑] Found license.key! Bootstrapping...")
                    res = requests.post(f"{SERVER_URL}/api/license/bootstrap", json={
                        "licenseKey": license_key,
                        "fingerprint": FINGERPRINT,
                        "agentId": AGENT_ID
                    }, timeout=10)
                    if res.status_code == 200:
                        data = res.json()
                        if data.get("success"):
                            save_to_env("TENANT_KEY", data["tenantKey"])
                            logging.info(f"[✔️] Bootstrap successful! Associated with {data['companyName']}")
                            return data["tenantKey"]
        return None
    except Exception as e:
        logging.error(f"[❌] Bootstrap error: {e}")
        return None

def save_to_env(key, value):
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f: lines = f.readlines()
    
    found = False
    new_lines = []
    for line in lines:
        if line.startswith(f"{key}="):
            new_lines.append(f"{key}={value}\n")
            found = True
        else:
            new_lines.append(line)
    if not found: new_lines.append(f"{key}={value}\n")
    with open(env_path, "w") as f: f.writelines(new_lines)
    os.environ[key] = value

# -----------------------------------------------------------
# CONNECT FUNCTION (UPDATED)
# -----------------------------------------------------------
def connect_socket():
    try:
        if not sio.connected:
            token = os.getenv("TENANT_KEY")
            if not token:
                logging.info("[ℹ️] TENANT_KEY missing. Starting bootstrap...")
                token = bootstrap_license()
            
            if token:
                auth_payload = {"token": token}
                sio.connect(SERVER_URL, auth=auth_payload)
            else:
                logging.error("[❌] Cannot connect: TENANT_KEY not resolved.")
    except Exception as e:
        logging.error(f"[⚠️] Socket connection failed: {e}")


# -----------------------------------------------------------
# QUEUE FLUSHING
# -----------------------------------------------------------
def flush_queue():
    while not send_queue.empty() and sio.connected:
        entry = send_queue.get()
        try:
            sio.emit("agent_data", entry)
            logging.info(f"[📡] Sent queued data: {entry['type']}")
        except Exception as e:
            logging.error(f"[❌] Failed to send queued data: {e}")
            send_queue.put(entry)
            break


# -----------------------------------------------------------
# SEND AGENT DATA
# -----------------------------------------------------------
def send_data(data_type, payload):
    if not IS_LICENSED:
        logging.warning(f"[🔒] Data transmission blocked: User Agent not licensed ({data_type})")
        return

    try:
        entry = {
            "timestamp": datetime.now().isoformat(),
            "agentId": AGENT_ID,
            "type": data_type,
            "data": payload,
        }

        send_queue.put(entry)

        if sio.connected:
            flush_queue()
        else:
            logging.info(f"[ℹ️] Socket not connected. Queued data: {data_type}")

    except Exception as e:
        logging.error(f"[❌] Failed to enqueue {data_type}: {e}")


# -----------------------------------------------------------
# SEND RAW LAN SCAN
# -----------------------------------------------------------
def send_raw_network_scan(devices_list):
    if not IS_LICENSED:
        return

    try:
        sio.emit("network_scan_raw", devices_list)
        logging.info("[📡] Sent raw network scan result.")
    except Exception as e:
        logging.error(f"[❌] Failed to send raw network scan: {e}")


# -----------------------------------------------------------
# BACKGROUND QUEUE WORKER
# -----------------------------------------------------------
def start_queue_worker():
    def worker():
        while True:
            if sio.connected:
                flush_queue()
            time.sleep(2)

    threading.Thread(target=worker, daemon=True).start()


start_queue_worker()
connect_socket()


# -----------------------------------------------------------
# ⭐ VULNERABILITY SCAN HANDLER
# -----------------------------------------------------------
@sio.on("run_vuln_scan")
def handle_vulnerability_scan(data=None):
    """
    Triggered when backend emits: io.to(socketId).emit("run_vuln_scan")
    """

    try:
        # Correct location: /agent/functions/network_vulnscan.py
        script_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "network_vulnscan.py"
        )

        logging.info("[⚡] Running vulnerability scan...")
        logging.info(f"[📌] Scanner path: {script_path}")

        # Run the script
        output = subprocess.check_output(
            [sys.executable, script_path],
            stderr=subprocess.STDOUT,
            text=True
        )

        result = json.loads(output)

        # NEW: backend processor for vuln scan
        sio.emit("network_vulnscan_raw", result)

        logging.info("[✔️] Vulnerability scan completed and sent.")

    except subprocess.CalledProcessError as err:
        logging.error(f"[❌] Vulnerability scan script error: {err.output}")
    except Exception as e:
        logging.error(f"[❌] Vulnerability scan failed: {e}")
