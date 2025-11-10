import time
import traceback
import threading
import pythoncom

from functions.system import get_system_info
from functions.ports import scan_ports
from functions.taskmanager import collect_process_info
from functions.installed_apps import get_installed_apps
from functions.sender import send_data
from functions.usbMonitor import monitor_usb, connect_socket, sio


def start_usb_monitor():
    """
    Start the USB monitor in a separate thread.
    Initializes COM for WMI to avoid errors in background threads.
    """
    pythoncom.CoInitialize()
    try:
        connect_socket()
        sio.latest_usb_status = None

        @sio.on("usb_validation")
        def handle_usb_validation(data):
            sio.latest_usb_status = data

        monitor_usb(interval=3, timeout=5)

    except Exception as e:
        print(f"[❌] USB monitor failed: {e}")
        traceback.print_exc()
    finally:
        pythoncom.CoUninitialize()


def run_scans():
    print("[⚙️] Running all scans...")

    try:
        # --- 1. System Info ---
        print("[🧠] Collecting system information...")
        sys_info = get_system_info()
        send_data("system_info", sys_info)
        print("    ✔ System info collected and sent.")

        # --- 2. Port Scan ---
        print("[🌐] Scanning ports 1-1024 on localhost...")
        port_data = scan_ports("127.0.0.1", "1-1024")
        send_data("port_scan", port_data)
        print("    ✔ Port scan completed and sent.")

        # --- 3. Task Manager ---
        print("[🧩] Collecting running processes...")
        process_data = collect_process_info()
        send_data("task_info", process_data)
        print("    ✔ Process info collected and sent.")

        # --- 4. Installed Apps ---
        print("[💻] Gathering installed applications...")
        app_data = get_installed_apps()
        send_data("installed_apps", {"apps": app_data, "count": len(app_data)})
        print(f"    ✔ Found {len(app_data)} installed apps.")

        # --- 5. USB Devices ---
        print("[🔌] Checking connected USB devices...")
        # The USB monitor is running separately, so this just triggers a status send
        if hasattr(sio, "latest_usb_status"):
            send_data("usb_devices", {"connected_devices": []})
        print("    ✔ USB monitor is running in background.")

    except Exception as e:
        print(f"[❌] Error during scans: {e}")
        print(traceback.format_exc())


if __name__ == "__main__":
    # Start USB monitor in background thread
    usb_thread = threading.Thread(target=start_usb_monitor, daemon=True)
    usb_thread.start()
    print("[ℹ️] USB monitor thread started.")

    # Main scan loop
    while True:
        run_scans()
        print("[⏳] Waiting 60 seconds before next scan...\n")
        time.sleep(60)
