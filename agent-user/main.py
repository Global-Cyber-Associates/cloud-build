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
    while True:
        try:
            safe_print("[SOCKET] connecting...")
            connect_socket()
            
            if sio.connected:
                safe_print("[SOCKET] Connected.")
                sio.wait()
                safe_print("[SOCKET] socket.wait() returned (disconnected).")
            else:
                safe_print("[SOCKET] Not connected, retrying in 5s...")

        except Exception as e:
            safe_print("[SOCKET ERROR]", e)
            traceback.print_exc()
        
        time.sleep(5)


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
    import ctypes
    
    # SINGLE INSTANCE CHECK
    # Mutex name must be unique per agent type
    mutex_name = "Global\\VisusAgentUserMutex"
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, mutex_name)
    last_error = ctypes.windll.kernel32.GetLastError()
    
    if last_error == 183:  # ERROR_ALREADY_EXISTS
        safe_print("[STARTUP] Agent is already running.")
        # Show Alert Box
        ctypes.windll.user32.MessageBoxW(0, "Agent is already running!", "Agent Error", 0x10 | 0x1000) # MB_ICONHAND | MB_SYSTEMMODAL
        sys.exit(0)

    safe_print("=== USER AGENT STARTED ===")

    # socket thread
    threading.Thread(target=start_socket, daemon=False).start()

    # usb monitor
    threading.Thread(target=start_usb_monitor, daemon=True).start()

    # main loop
    while True:
        run_scans()
        time.sleep(3)
