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

logging.basicConfig(level=logging.INFO)

load_dotenv()
SERVER_URL = os.getenv("SERVER_URL")
AGENT_ID = os.getenv("AGENT_ID", platform.node())


# -----------------------------------------------------------
# SOCKET.IO CLIENT
# -----------------------------------------------------------
sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=5,
    reconnection_delay=3
)

send_queue = Queue()


# -----------------------------------------------------------
# SOCKET EVENTS
# -----------------------------------------------------------
@sio.event
def connect():
    logging.info(f"[🔌] Connected to backend Socket.IO at {SERVER_URL}")

    # ⭐ REGISTER AGENT
    try:
        sio.emit("register_agent", AGENT_ID)
        logging.info(f"[🆔] Registered agent: {AGENT_ID}")
    except Exception as e:
        logging.error(f"[❌] Failed to register agent: {e}")

    flush_queue()


@sio.event
def disconnect():
    logging.warning("[⚠️] Disconnected from backend server.")


# -----------------------------------------------------------
# CONNECT FUNCTION
# -----------------------------------------------------------
def connect_socket():
    try:
        if not sio.connected:
            sio.connect(SERVER_URL)
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
