import json
import os
import logging
import platform
from datetime import datetime
from dotenv import load_dotenv
import socketio
import time

logging.basicConfig(level=logging.INFO)
OUTPUT_FILE = "sent.json"
UNSENT_FILE = "unsent.json"
MAX_APPS = 200

load_dotenv()
SERVER_URL = os.getenv("SERVER_URL", "http://localhost:5000")
AGENT_ID = os.getenv("AGENT_ID", platform.node())

sio = socketio.Client(reconnection=True, reconnection_attempts=5, reconnection_delay=3)


@sio.event
def connect():
    logging.info(f"[🔌] Connected to backend Socket.IO at {SERVER_URL}")
    resend_unsent_data()


@sio.event
def disconnect():
    logging.warning("[⚠️] Disconnected from backend server.")


def connect_socket():
    try:
        if not sio.connected:
            sio.connect(SERVER_URL)
    except Exception as e:
        logging.error(f"[⚠️] Socket connection failed: {e}")


def resend_unsent_data():
    if not os.path.exists(UNSENT_FILE):
        return

    try:
        with open(UNSENT_FILE, "r", encoding="utf-8") as f:
            unsent = json.load(f)
        if not isinstance(unsent, list):
            unsent = []
    except Exception:
        unsent = []

    if unsent and sio.connected:
        logging.info(f"[📤] Resending {len(unsent)} unsent entries...")
        for entry in unsent:
            sio.emit("agent_data", entry)
            time.sleep(0.5)
        os.remove(UNSENT_FILE)
        logging.info("[✅] All unsent entries delivered.")
    else:
        logging.info("[ℹ️] No unsent data to resend or still offline.")


def send_data(data_type, payload):
    try:
        # Wrap USB devices in array if needed
        if data_type == "usb_devices":
            devices = payload.get("connected_devices")
            if devices is None:
                payload = {"connected_devices": [payload]}
            else:
                payload = {"connected_devices": devices}

        entry = {
            "timestamp": datetime.now().isoformat(),
            "agentId": AGENT_ID,
            "type": data_type,
            "data": payload,
        }

        # Save locally
        existing = []
        if os.path.exists(OUTPUT_FILE):
            try:
                with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                    existing = json.load(f)
                if not isinstance(existing, list):
                    existing = []
            except json.JSONDecodeError:
                existing = []

        existing.append(entry)
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=4)

        logging.info(f"[💾] Saved data ({data_type}) locally.")

        # Send via socket
        connect_socket()
        if sio.connected:
            sio.emit("agent_data", entry)
            logging.info(f"[📡] Sent {data_type} to backend.")
        else:
            raise ConnectionError("Socket not connected")

    except Exception as e:
        logging.error(f"[❌] Failed to send {data_type}: {e}")
        # Save unsent data
        try:
            unsent = []
            if os.path.exists(UNSENT_FILE):
                with open(UNSENT_FILE, "r", encoding="utf-8") as f:
                    unsent = json.load(f)
                    if not isinstance(unsent, list):
                        unsent = []
            unsent.append(entry)
            with open(UNSENT_FILE, "w", encoding="utf-8") as f:
                json.dump(unsent, f, indent=4)
            logging.info(f"[💾] Cached unsent data ({data_type}) for retry.")
        except Exception as cache_err:
            logging.error(f"[❌] Failed to cache unsent data: {cache_err}")
