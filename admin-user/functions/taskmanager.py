# functions/taskmanager.py
import time
import traceback
from typing import Dict, Any, List

try:
    import psutil
except Exception:
    psutil = None

# Windows-specific window enumeration only if on Windows and pywin32 present
try:
    import win32gui
    import win32process
except Exception:
    win32gui = None
    win32process = None

def get_visible_windows() -> List[tuple]:
    """Return a list of (pid, title) for visible top-level windows."""
    apps = []
    if not win32gui:
        return apps

    def callback(hwnd, _):
        try:
            if win32gui.IsWindowVisible(hwnd) and win32gui.GetWindowText(hwnd):
                _, pid = win32process.GetWindowThreadProcessId(hwnd)
                apps.append((pid, win32gui.GetWindowText(hwnd)))
        except Exception:
            pass
        return True

    try:
        win32gui.EnumWindows(callback, None)
    except Exception:
        pass
    return apps

def get_background_processes() -> List[tuple]:
    """Return list of (pid, name) for background processes (no visible window)."""
    visible_pids = {pid for pid, _ in get_visible_windows()}
    bg_processes = []
    if not psutil:
        return bg_processes

    for proc in psutil.process_iter(["pid", "name"]):
        try:
            pid = proc.info["pid"]
            name = proc.info["name"]
            if pid not in visible_pids and name:
                bg_processes.append((pid, name))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        except Exception:
            continue
    return bg_processes

def collect_process_info(measure_interval: float = 1.0) -> Dict[str, Any]:
    """
    Collect foreground (visible window) apps and background processes with CPU & memory percents.
    - measure_interval: seconds to wait between cpu_percent() initialisation and reading.
    """
    output = {"applications": [], "background_processes": []}
    if not psutil:
        return output

    try:
        # initialize CPU counters
        for proc in psutil.process_iter():
            try:
                proc.cpu_percent(interval=None)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        time.sleep(measure_interval)  # measure CPU usage over interval

        # Foreground apps
        for pid, title in get_visible_windows():
            try:
                proc = psutil.Process(pid)
                name = proc.name()
                if not name:
                    continue
                output["applications"].append({
                    "pid": pid,
                    "name": name,
                    "title": title,
                    "cpu_percent": proc.cpu_percent(),
                    "memory_percent": round(proc.memory_percent(), 2)
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            except Exception:
                continue

        # Background processes
        for pid, name in get_background_processes():
            try:
                proc = psutil.Process(pid)
                output["background_processes"].append({
                    "pid": pid,
                    "name": name,
                    "cpu_percent": proc.cpu_percent(),
                    "memory_percent": round(proc.memory_percent(), 2)
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            except Exception:
                continue

        return output
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}
