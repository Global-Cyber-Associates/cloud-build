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


# ============================
# SAFE PRINT
# ============================
def safe_print(*args, **kwargs):
    try:
        print(*args, **kwargs)
    except:
        pass


# ============================
# USB MONITOR THREAD
# ============================
def start_usb_monitor():
    try:
        pythoncom.CoInitialize()
    except:
        pass

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
        monitor_usb(interval=3, timeout=5)
    except Exception as e:
        traceback.print_exc()
    finally:
        try:
            pythoncom.CoUninitialize()
        except:
            pass


# ============================
# SOCKET THREAD
# ============================
def start_socket():
    safe_print("[SOCKET] Starting socket...")
    try:
        connect_socket()

        @sio.event
        def connect():
            safe_print("[SOCKET CONNECTED]")

        @sio.event
        def disconnect():
            safe_print("[SOCKET DISCONNECTED]")

        sio.wait()

    except Exception as e:
        safe_print("[SOCKET ERROR]", e)
        traceback.print_exc()


# ============================
# MAIN SYSTEM SCANS
# ============================
def run_scans():
    try:
        # ✔ FIX: SEND EXACTLY LIKE ADMIN AGENT
        sysinfo = get_system_info()
        send_data("system_info", sysinfo)

        # other unchanged events
        send_data("task_info", collect_process_info())

        apps = get_installed_apps()
        send_data("installed_apps", {
            "apps": apps,
            "count": len(apps)
        })

    except Exception as e:
        safe_print("[SCAN ERROR]", e)
        traceback.print_exc()


# ============================
# ENTRY POINT
# ============================
if __name__ == "__main__":
    safe_print("=== USER AGENT STARTED ===")

    # socket thread
    threading.Thread(target=start_socket, daemon=False).start()

    # usb monitor
    threading.Thread(target=start_usb_monitor, daemon=True).start()

    # main loop
    while True:
        run_scans()
        time.sleep(3)
