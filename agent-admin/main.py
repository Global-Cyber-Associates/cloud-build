import time
import traceback
import threading
import pythoncom
import subprocess
import json
import os
import sys

from functions.system import get_system_info
from functions.ports import scan_ports
from functions.taskmanager import collect_process_info
from functions.installed_apps import get_installed_apps
from functions.sender import send_data, send_raw_network_scan
from functions.usbMonitor import monitor_usb, connect_socket, sio


# ---------------- PATH HANDLER ----------------
def resource_path(relative_path):
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)


# ---------------- USB MONITOR ----------------
def start_usb_monitor():
    """
    Runs USB monitor in EXE-safe mode.
    Structure unchanged, only stability fixes added.
    """
    try:
        pythoncom.CoInitialize()
    except Exception as e:
        print("[USB] CoInitialize failed:", e)

    print("[USB] Monitor thread started")

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
        print("[USB] monitor_usb crashed:", e)
        traceback.print_exc()
    finally:
        try:
            pythoncom.CoUninitialize()
        except:
            pass


# ---------------- NETWORK SCANNER ----------------
def start_network_scanner():
    stabilizer_path = resource_path("visualizer-scanner/stabilizer.py")
    print("STABILIZER PATH =", stabilizer_path)

    # --- HIDE CHILD CONSOLE WINDOW (Important fix) ---
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW

    try:
        return subprocess.Popen(
            ["python", stabilizer_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            startupinfo=si,
            creationflags=subprocess.CREATE_NO_WINDOW  # <-- FIX: hides Python console
        )
    except Exception as e:
        print("[❌] Stabilizer failed:", e)
        return None


def read_scanner_output(process):
    print("[📡] Stabilizer listener ACTIVE")

    if not process:
        return

    try:
        for line in process.stdout:
            line = line.strip()
            if not line:
                continue

            print("[STABILIZER RAW] ->", line)

            try:
                devices = json.loads(line)
                send_raw_network_scan(devices)
                print("[STABLE JSON SENT]", len(devices))
            except Exception as e:
                print("[STABILIZER JSON ERROR]:", e)
                print("LINE:", line)
    except Exception as e:
        print("[❌] Stabilizer stream error:", e)


# ---------------- MAIN AGENT SCANS ----------------
def run_scans():
    try:
        send_data("system_info", get_system_info())
        send_data("port_scan", scan_ports("127.0.0.1", "1-1024"))
        send_data("task_info", collect_process_info())

        apps = get_installed_apps()
        send_data("installed_apps", {"apps": apps, "count": len(apps)})

        # USB status sent inside usbMonitor
    except Exception as e:
        print("[❌] Scan error:", e)
        traceback.print_exc()


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


# ---------------- MAIN ENTRY ----------------
if __name__ == "__main__":

    print("=== AGENT STARTED ===")
    print("Executable:", sys.executable)
    print("CWD:", os.getcwd())
    print("Frozen:", getattr(sys, "frozen", False))

    # Prevent duplicates
    try:
        import psutil
        if already_running():
            print("[⚠️] Another instance is running. Exiting.")
            sys.exit(0)
    except:
        pass

    # ---------------- SOCKET START (NON-DAEMON) ----------------
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

            if hasattr(sio, "wait"):
                sio.wait()
            else:
                while True:
                    time.sleep(60)

        except Exception as e:
            print("[SOCKET] Thread crashed:", e)
            traceback.print_exc()

    socket_thread = threading.Thread(target=start_socket, daemon=False)
    socket_thread.start()

    # ---------------- USB MONITOR ----------------
    threading.Thread(target=start_usb_monitor, daemon=True).start()

    # ---------------- NETWORK SCANNER ----------------
    sp = start_network_scanner()
    if sp:
        threading.Thread(target=read_scanner_output, args=(sp,), daemon=True).start()

    # ---------------- MAIN LOOP ----------------
    while True:
        run_scans()
        time.sleep(3)
