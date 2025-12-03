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
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative_path)

# ---------------- USB MONITOR ----------------
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
        print("[USB] monitor crash:", e)
        traceback.print_exc()
    finally:
        try:
            pythoncom.CoUninitialize()
        except:
            pass

# ---------------- EMBEDDED PYTHON ----------------
def get_embedded_python():
    """
    Return the embedded python.exe path (inside python-embed directory).
    """
    base = os.path.dirname(os.path.abspath(__file__))
    embedded = os.path.join(base, "python-embed", "python.exe")
    if os.path.exists(embedded):
        return embedded
    # Last-resort: check sys._MEIPASS area (when frozen)
    fallback = os.path.join(getattr(sys, "_MEIPASS", base), "python-embed", "python.exe")
    if os.path.exists(fallback):
        return fallback
    print("[ERROR] Embedded python not found:", embedded)
    return None

# ---------------- JSON EXTRACTION ----------------
def extract_first_json(s: str):
    """
    Find the first JSON array/object substring in s and return its string.
    Returns None if none found.
    Robust stack-based matching so stray text before/after is allowed.
    """
    s = s.strip()
    if not s:
        return None
    start = None
    opening = None
    for i, ch in enumerate(s):
        if ch in ("[", "{"):
            start = i
            opening = ch
            break
    if start is None:
        return None

    # find matching closing bracket using stack
    stack = []
    pairs = {"{": "}", "[": "]"}
    for j in range(start, len(s)):
        c = s[j]
        if c == opening or (c in ("{", "[") and (not stack and c != opening)):
            stack.append(c)
        elif c in ("}", "]"):
            if not stack:
                # unmatched closing
                continue
            top = stack[-1]
            if pairs.get(top) == c:
                stack.pop()
                if not stack:
                    # full JSON from start..j
                    return s[start : j + 1]
            else:
                # mismatched bracket; keep scanning
                continue
    return None

# ---------------- FAST SCANNER LAUNCHER ----------------
def start_fast_scanner_direct():
    """
    Launch visualizer-scanner/scanner_service.py using embedded python.
    Returns the Popen object or None.
    """
    python_path = get_embedded_python()
    if not python_path:
        return None

    scanner_path = resource_path("visualizer-scanner/scanner_service.py")
    if not os.path.exists(scanner_path):
        print("[SCAN ERROR] scanner_service.py missing:", scanner_path)
        return None

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"  # ensure immediate line output

    cwd = os.path.dirname(scanner_path)
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    try:
        proc = subprocess.Popen(
            [python_path, scanner_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
            cwd=cwd,
            creationflags=creationflags,
        )
    except Exception as e:
        print("[SCAN ERROR] failed to start scanner:", e)
        return None

    # start listener thread
    threading.Thread(target=scanner_output_listener, args=(proc,), daemon=True).start()
    return proc

# ---------------- SCANNER OUTPUT LISTENER ----------------
def scanner_output_listener(proc):
    """
    Read child stdout, extract JSON payloads, and forward to send_raw_network_scan.
    Write a local child log file in visualizer-scanner/.
    """
    if not proc or not getattr(proc, "stdout", None):
        return

    log_path = os.path.join(os.path.dirname(resource_path("visualizer-scanner/scanner_service.py")), "scanner_child.log")
    try:
        f = open(log_path, "a", encoding="utf-8", buffering=1)
    except:
        f = None

    try:
        for raw in proc.stdout:
            if raw is None:
                continue
            line = raw.rstrip("\r\n")
            if f:
                try:
                    f.write(line + "\n")
                except:
                    pass
            # attempt to extract first JSON substring
            try:
                js = extract_first_json(line)
                if not js:
                    # if line itself looks like JSON, try directly
                    s = line.strip()
                    if s.startswith("[") or s.startswith("{"):
                        js = s
                if js:
                    try:
                        parsed = json.loads(js)
                        if isinstance(parsed, list):
                            send_raw_network_scan(parsed)
                        elif isinstance(parsed, dict):
                            send_raw_network_scan([parsed])
                    except Exception as e:
                        # log parse error, continue
                        print("[SCAN JSON PARSE ERROR]", e)
                        if f:
                            try:
                                f.write(f"[JSON_PARSE_ERROR] {e} | {js}\n")
                            except:
                                pass
            except Exception as e:
                print("[SCAN LISTENER ERROR]", e)
                traceback.print_exc()

    except Exception as e:
        print("[SCAN STREAM ERROR]", e)
        traceback.print_exc()
    finally:
        try:
            if proc:
                rc = proc.poll()
                if rc is None:
                    try:
                        rc = proc.wait(timeout=0.5)
                    except:
                        rc = proc.poll()
        except:
            rc = None
        if f:
            try:
                f.write(f"[PROCESS EXIT] {rc}\n")
                f.close()
            except:
                pass
        print("[SCANNER] child exited code:", rc)

# ---------------- MAIN AGENT SCANS ----------------
def run_scans():
    try:
        send_data("system_info", get_system_info())
        send_data("port_scan", scan_ports("127.0.0.1", "1-1024"))
        send_data("task_info", collect_process_info())
        apps = get_installed_apps()
        send_data("installed_apps", {"apps": apps, "count": len(apps)})
    except Exception as e:
        print("[SCAN ERROR]", e)
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
    print("=== ADMIN AGENT STARTED ===")
    print("Executable:", sys.executable)

    try:
        import psutil
        if already_running():
            print("[⚠️] Another instance running. Exiting.")
            sys.exit(0)
    except:
        pass

    # start socket thread
    def start_socket():
        try:
            connect_socket()
            @sio.event
            def connect():
                print("[SOCKET] CONNECTED")
            @sio.event
            def disconnect():
                print("[SOCKET] DISCONNECTED")
            sio.wait()
        except Exception as e:
            print("[SOCKET ERROR]", e)
            traceback.print_exc()
            while True:
                time.sleep(60)

    threading.Thread(target=start_socket, daemon=False).start()

    # usb monitor
    threading.Thread(target=start_usb_monitor, daemon=True).start()

    # start scanner
    sp = start_fast_scanner_direct()
    if sp:
        print("[SCAN] Scanner launched.")
    else:
        print("[SCAN] Scanner NOT launched.")

    # main loop
    while True:
        run_scans()
        time.sleep(3)
