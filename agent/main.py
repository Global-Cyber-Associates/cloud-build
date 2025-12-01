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


# ---------------- PATH HANDLER (WORKS FOR EXE + PYTHON) ----------------
def resource_path(relative_path):
    """
    Returns correct path for both script & PyInstaller EXE.
    """
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)


# ---------------- SOCKET (NON-DAEMON) ----------------
def start_socket():
    """
    Starts the socket connection and keeps the thread alive.
    This must run as a NON-DAEMON thread in an EXE build so PyInstaller
    doesn't terminate it and cause immediate disconnects.
    """
    try:
        connect_socket()  # your usbMonitor.connect_socket() should attach handlers to `sio`

        # If socketio client exposes wait(), use it to block and maintain heartbeat.
        if hasattr(sio, "wait"):
            try:
                sio.wait()  # blocks until disconnected
            except Exception:
                # Some implementations throw on wait() when disconnected; that's fine.
                pass
        else:
            # fallback keep-alive loop if sio.wait() isn't available
            while True:
                time.sleep(60)

    except Exception as e:
        print(f"[❌] Socket thread crashed: {e}")
        traceback.print_exc()


# ---------------- USB MONITOR (DAEMON) ----------------
def start_usb_monitor():
    """
    Runs monitor_usb in its own daemon thread. This is non-blocking for the socket.
    Note: Do NOT call connect_socket() here when using start_socket() above.
    """
    try:
        pythoncom.CoInitialize()
        # initialize any socket-related attributes without connecting here
        try:
            sio.latest_usb_status = None
        except Exception:
            pass

        # register event handlers locally if needed (safe to register multiple times)
        @sio.on("usb_validation")
        def handle_usb_validation(data):
            try:
                sio.latest_usb_status = data
            except Exception:
                pass

        # This call is expected to block internally (it runs monitoring loop).
        monitor_usb(interval=3, timeout=5)

    except Exception as e:
        print(f"[❌] USB monitor failed: {e}")
        traceback.print_exc()
    finally:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


# ---------------- NETWORK SCANNER (SAFE FOR EXE) ----------------
def start_network_scanner():
    stabilizer_path = resource_path("visualizer-scanner/stabilizer.py")
    print("STABILIZER PATH =", stabilizer_path)

    # Use system "python" to run stabilizer.py to avoid re-invoking the agent exe.
    # If target environment doesn't have python, you'll need a different packaging approach.
    try:
        return subprocess.Popen(
            ["python", stabilizer_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
    except Exception as e:
        print(f"[❌] Failed to start stabilizer subprocess: {e}")
        traceback.print_exc()
        return None


def read_scanner_output(process):
    if not process:
        print("[⚠] No stabilizer process available to read from.")
        return

    print("[📡] Stabilizer listener ACTIVE. Waiting for stable lines...")
    try:
        for line in process.stdout:
            line = line.strip()
            if not line:
                continue

            print("[STABILIZER RAW] ->", line)
            try:
                devices = json.loads(line)
                send_raw_network_scan(devices)
                print("[STABLE JSON SENT] ->", len(devices), "devices")
            except Exception as e:
                print("STABILIZER JSON ERROR:", e)
                print("LINE WAS:", line)
    except Exception as e:
        print(f"[❌] Error reading stabilizer output: {e}")
        traceback.print_exc()


# ---------------- MAIN AGENT SCANS ----------------
def run_scans():
    try:
        sys_info = get_system_info()
        send_data("system_info", sys_info)

        port_data = scan_ports("127.0.0.1", "1-1024")
        send_data("port_scan", port_data)

        process_data = collect_process_info()
        send_data("task_info", process_data)

        app_data = get_installed_apps()
        send_data("installed_apps", {"apps": app_data, "count": len(app_data)})

        if hasattr(sio, "latest_usb_status"):
            send_data("usb_devices", {"connected_devices": []})

    except Exception as e:
        print(f"[❌] Error during scans: {e}")
        print(traceback.format_exc())


# ---------------- SINGLE INSTANCE LOCK (PREVENT MULTIPLE AGENTS) ----------------
def already_running():
    try:
        import psutil
    except Exception:
        return False

    exe_name = os.path.basename(sys.executable).lower()
    count = 0
    for p in psutil.process_iter(['pid', 'name']):
        try:
            if p.info['name'] and exe_name in p.info['name'].lower():
                count += 1
        except Exception:
            pass

    return count > 1


# ---------------- MAIN ENTRY ----------------
if __name__ == "__main__":
    # Prevent multiple agents from running
    try:
        import psutil
        if already_running():
            print("[⚠️] Another agent instance already running. Exiting.")
            sys.exit(0)
    except ImportError:
        print("[⚠️] psutil missing — cannot enforce single instance lock.")

    # --- Start socket thread FIRST and NON-DAEMON (CRITICAL for EXE builds) ---
    socket_thread = threading.Thread(target=start_socket, daemon=False)
    socket_thread.start()

    # --- USB monitor runs separately as DAEMON so it doesn't block socket ---
    usb_thread = threading.Thread(target=start_usb_monitor, daemon=True)
    usb_thread.start()

    # --- Start network stabilizer and its reader ---
    scanner_process = start_network_scanner()
    if scanner_process:
        threading.Thread(target=read_scanner_output, args=(scanner_process,), daemon=True).start()

    # --- Main periodic scans (keeps main thread busy and alive) ---
    try:
        while True:
            run_scans()
            time.sleep(3)
    except KeyboardInterrupt:
        print("Agent stopped by keyboard interrupt.")
    except Exception:
        traceback.print_exc()
