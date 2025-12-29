import time
import traceback
import threading
import pythoncom
import subprocess
import json
import os
import sys
import runpy

from functions.system import get_system_info
from functions.ports import scan_ports
from functions.taskmanager import collect_process_info
from functions.installed_apps import get_installed_apps
from functions.sender import send_data, send_raw_network_scan
from functions.usbMonitor import monitor_usb, connect_socket, sio

# ============================
# SAFE PRINT (NO FILES) — silent for --noconsole
# ============================
def safe_print(*args, **kwargs):
    # intentionally do nothing to avoid creating files when running hidden
    return

# ============================
# RESOURCE PATH (MEIPASS)
# ============================
def resource_path(relative):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative)

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
        safe_print("[USB ERROR]", e)
        traceback.print_exc()
    finally:
        try:
            pythoncom.CoUninitialize()
        except:
            pass

# ==========================================================
# START SCANNER (NO TEMP FILES)
#
# Strategy:
#  - If python-embed/python.exe exists -> spawn subprocess with it (hidden).
#  - Else if running non-frozen (normal python) -> spawn subprocess with sys.executable.
#  - Else (frozen EXE without embed) -> run scanner_service.py in a background thread using runpy.
# ==========================================================
def start_visualizer_scanner():
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    original_scan = os.path.join(base, "visualizer-scanner", "scanner_service.py")
    if not os.path.exists(original_scan):
        safe_print("[SCAN ERROR] scanner_service.py missing:", original_scan)
        return None

    # prefer embedded python if present
    python_embed = os.path.join(base, "python-embed", "python.exe")
    if os.path.exists(python_embed):
        cmd = [python_embed, "-u", original_scan]
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=os.path.dirname(original_scan),
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            threading.Thread(target=scanner_output_listener, args=(proc,), daemon=True).start()
            safe_print("[SCAN] started with embedded python")
            return proc
        except Exception as e:
            safe_print("[SCAN ERROR] embedded python failed:", e)
            traceback.print_exc()
            return None

    # if not frozen/pyinstaller (running as script), spawn normal python process
    if not getattr(sys, "frozen", False):
        try:
            cmd = [sys.executable, original_scan]
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=os.path.dirname(original_scan)
            )
            threading.Thread(target=scanner_output_listener, args=(proc,), daemon=True).start()
            safe_print("[SCAN] started via sys.executable")
            return proc
        except Exception as e:
            safe_print("[SCAN ERROR] starting scanner via sys.executable failed:", e)
            traceback.print_exc()
            return None

    # else: frozen EXE without embedded python — run scanner in-thread (no files, no subprocess)
    try:
        def run_scanner_in_thread():
            try:
                # run_path runs the script in its own globals; keep it daemon
                runpy.run_path(original_scan, run_name="__scanner_service__")
            except Exception as e:
                safe_print("[SCAN THREAD ERROR]", e)
                traceback.print_exc()

        t = threading.Thread(target=run_scanner_in_thread, daemon=True)
        t.start()
        safe_print("[SCAN] scanner service started in-thread (frozen mode)")
        return None  # no subprocess object
    except Exception as e:
        safe_print("[SCAN ERROR] cannot run scanner in-thread:", e)
        traceback.print_exc()
        return None

# ==========================================================
# SCANNER OUTPUT LISTENER (parses JSON arrays/objects)
# ==========================================================
def extract_first_json(s):
    s = s.strip()
    if not s:
        return None
    start = None
    for i, ch in enumerate(s):
        if ch in ("[", "{"):
            start = i
            break
    if start is None:
        return None
    pairs = {"{": "}", "[": "]"}
    stack = []
    for j in range(start, len(s)):
        c = s[j]
        if c in ("{", "["):
            stack.append(c)
        elif c in ("}", "]"):
            if not stack:
                continue
            top = stack[-1]
            if pairs.get(top) == c:
                stack.pop()
                if not stack:
                    return s[start:j+1]
    return None

def scanner_output_listener(proc):
    if not proc or not getattr(proc, "stdout", None):
        return
    try:
        for raw in proc.stdout:
            if not raw:
                continue
            line = raw.strip()
            js = extract_first_json(line)
            if not js:
                continue
            try:
                parsed = json.loads(js)
                if isinstance(parsed, list):
                    send_raw_network_scan(parsed)
                elif isinstance(parsed, dict):
                    send_raw_network_scan([parsed])
            except Exception:
                pass
    except Exception as e:
        safe_print("[SCAN STREAM ERROR]", e)
        traceback.print_exc()

# ==========================================================
# MAIN SYSTEM SCANS
# ==========================================================
def run_scans():
    try:
        send_data("system_info", get_system_info())
        send_data("port_scan", scan_ports("127.0.0.1", "1-1024"))
        send_data("task_info", collect_process_info())
        apps = get_installed_apps()
        send_data("installed_apps", {"apps": apps, "count": len(apps)})
    except Exception as e:
        safe_print("[SCAN ERROR]", e)
        traceback.print_exc()

# ==========================================================
# MAIN ENTRY (NO FILE CREATION)
# ==========================================================
if __name__ == "__main__":
    import ctypes
    
    # SINGLE INSTANCE CHECK
    # Mutex name must be unique per agent type
    mutex_name = "Global\\VisusAgentAdminMutex"
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, mutex_name)
    last_error = ctypes.windll.kernel32.GetLastError()
    
    if last_error == 183:  # ERROR_ALREADY_EXISTS
        safe_print("[STARTUP] Agent is already running.")
        # Show Alert Box
        ctypes.windll.user32.MessageBoxW(0, "Agent is already running!", "Agent Error", 0x10 | 0x1000) # MB_ICONHAND | MB_SYSTEMMODAL
        sys.exit(0)

    safe_print("=== ADMIN AGENT START ===")

    # socket thread
    def start_socket():
        while True:
            try:
                safe_print("[SOCKET] connecting...")
                connect_socket()
                
                # If we are here, we might be connected or just returned. 
                # We need to keep the thread alive and listening or retrying.
                # connect_socket() in sender.py is a one-off attempt usually, 
                # but if we want to ensure we stay connected or wait:
                
                if sio.connected:
                   safe_print("[SOCKET] Connected.")
                   sio.wait() # This blocks until disconnect
                   safe_print("[SOCKET] socket.wait() returned (disconnected).")
                else:
                   safe_print("[SOCKET] Not connected, retrying in 5s...")
                   
            except Exception as e:
                safe_print("[SOCKET ERROR]", e)
            
            # safeguard sleep before retry
            time.sleep(5)

    threading.Thread(target=start_socket, daemon=False).start()

    # usb monitor
    threading.Thread(target=start_usb_monitor, daemon=True).start()

    # start scanner (no temp files)
    sp = start_visualizer_scanner()
    if not sp:
        safe_print("[SCAN] Scanner started in-thread or failed to spawn subprocess.")

    # main loop
    # main loop
    import functions.sender as sender
    while True:
        if sender.IS_LICENSED:
            run_scans()
        else:
            # Maybe run minimal heartbeat if not licensed
            pass
        time.sleep(3)
