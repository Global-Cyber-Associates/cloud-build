import time
import traceback
import threading
import pythoncom
import json
import os
import sys

from functions.system import get_system_info
from functions.taskmanager import collect_process_info
from functions.installed_apps import get_installed_apps
from functions.sender import send_data
from functions.usbMonitor import monitor_usb, connect_socket, sio


# ---------------- SINGLE INSTANCE LOCK ----------------
def already_running():
    try:
        import psutil
    except:
        return False

    exe = os.path.basename(sys.executable).lower()
    count = 0

    for p in psutil.process_iter(['name']):
        try:
            if p.info['name'] and exe in p.info['name'].lower():
                count += 1
        except:
            pass

    return count > 1


# ---------------- USB MONITOR THREAD ----------------
def start_usb_monitor():
    try:
        pythoncom.CoInitialize()
    except Exception as e:
        print("[USB] CoInitialize failed:", e)

    print("[USB] Monitor thread started")

    # backend → agent validation data
    try:
        sio.latest_usb_status = None
    except:
        pass

    @sio.on("usb_validation")
    def handle_usb_validation(data):
        try:
            sio.latest_usb_status = data
        except:
            pass

    try:
        # Just run USB loop (already EXE-safe inside usbMonitor)
        monitor_usb(interval=3, timeout=5)
    except Exception as e:
        print("[USB] monitor_usb crashed:", e)
        traceback.print_exc()
    finally:
        try:
            pythoncom.CoUninitialize()
        except:
            pass


# ---------------- SOCKET THREAD ----------------
def start_socket():
    print("[SOCKET] Starting socket...")

    try:
        connect_socket()

        @sio.event
        def connect():
            print("[SOCKET] CONNECTED")

        @sio.event
        def disconnect():
            print("[SOCKET] DISCONNECTED")

        # Keep alive
        if hasattr(sio, "wait"):
            sio.wait()
        else:
            while True:
                time.sleep(60)

    except Exception as e:
        print("[SOCKET] Thread crashed:", e)
        traceback.print_exc()


# ---------------- MAIN SCANS (ONLY what user agent needs) ----------------
def run_scans():
    try:
        # System info
        send_data("system_info", get_system_info())

        # Running processes
        send_data("task_info", collect_process_info())

        # Installed apps
        apps = get_installed_apps()
        send_data("installed_apps", {"apps": apps, "count": len(apps)})

        # USB handled separately

    except Exception as e:
        print("[❌] Scan error:", e)
        traceback.print_exc()


# ---------------- MAIN ENTRY ----------------
if __name__ == "__main__":
    print("=== USER AGENT STARTED ===")
    print("Executable:", sys.executable)
    print("CWD:", os.getcwd())
    print("Frozen:", getattr(sys, "frozen", False))

    # Prevent duplicate instances
    try:
        import psutil
        if already_running():
            print("[⚠️] Another instance is running. Exiting.")
            sys.exit(0)
    except:
        pass

    # Start main socket thread (non-daemon)
    threading.Thread(target=start_socket, daemon=False).start()

    # Start USB monitor thread
    threading.Thread(target=start_usb_monitor, daemon=True).start()

    # Main agent loop
    while True:
        run_scans()
        time.sleep(3)
