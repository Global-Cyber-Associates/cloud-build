import os
import logging
import platform
from datetime import datetime
from dotenv import load_dotenv
import socketio
import time
import threading
from queue import Queue

logging.basicConfig(level=logging.INFO)

load_dotenv()
SERVER_URL = os.getenv("SERVER_URL")
AGENT_ID = os.getenv("AGENT_ID", platform.node())

sio = socketio.Client(reconnection=True, reconnection_attempts=5, reconnection_delay=3)
send_queue = Queue()  # In-memory queue for unsent data

@sio.event
def connect():
    logging.info(f"[🔌] Connected to backend Socket.IO at {SERVER_URL}")
    flush_queue()

@sio.event
def disconnect():
    logging.warning("[⚠️] Disconnected from backend server.")

def connect_socket():
    try:
        if not sio.connected:
            sio.connect(SERVER_URL)
    except Exception as e:
        logging.error(f"[⚠️] Socket connection failed: {e}")

def flush_queue():
    """Send everything in the queue when socket is connected."""
    while not send_queue.empty() and sio.connected:
        entry = send_queue.get()
        try:
            sio.emit("agent_data", entry)
            logging.info(f"[📡] Sent queued data: {entry['type']}")
        except Exception as e:
            logging.error(f"[❌] Failed to send queued data: {e}")
            send_queue.put(entry)  # Requeue if failed
            break  # Stop and retry later

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

        send_queue.put(entry)  # Always queue the data
        if sio.connected:
            flush_queue()  # Try sending immediately
        else:
            logging.info(f"[ℹ️] Socket not connected. Queued data: {data_type}")

    except Exception as e:
        logging.error(f"[❌] Failed to enqueue {data_type}: {e}")

def start_queue_worker():
    """Background thread to retry sending data every few seconds."""
    def worker():
        while True:
            if sio.connected:
                flush_queue()
            time.sleep(2)  # Retry interval

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

start_queue_worker()
connect_socket()
