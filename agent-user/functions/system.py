# functions/system.py
import platform
import socket
import uuid
import getpass
from pathlib import Path
from typing import Dict, Any, List

try:
    import psutil
except Exception:
    psutil = None

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None


# -------------------------------------------------------
# GET PRIMARY IP (works even without WiFi)
# -------------------------------------------------------
def _get_ip_address() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "unknown"


# -------------------------------------------------------
# GET WLAN/WIFI INTERFACES
# -------------------------------------------------------
def _get_wlan_interfaces() -> List[Dict[str, Any]]:
    wlan_list = []
    if not psutil:
        return wlan_list

    try:
        addrs = psutil.net_if_addrs()
        for interface, info in addrs.items():
            lname = interface.lower()
            if "wlan" in lname or "wi-fi" in lname or "wifi" in lname:
                for addr in info:
                    if addr.family == socket.AF_INET:
                        wlan_list.append({
                            "interface_name": interface,
                            "type": "IPv4",
                            "address": addr.address,
                            "netmask": addr.netmask,
                            "broadcast": getattr(addr, "broadcast", None),
                        })
    except Exception:
        pass

    return wlan_list


# -------------------------------------------------------
# CPU INFO
# -------------------------------------------------------
def _get_cpu_info() -> Dict[str, Any]:
    if not psutil:
        return {}
    try:
        freq = psutil.cpu_freq()
        return {
            "physical_cores": psutil.cpu_count(logical=False),
            "logical_cores": psutil.cpu_count(logical=True),
            "cpu_freq_mhz": round(freq.current if freq else 0, 2),
        }
    except Exception:
        return {}


# -------------------------------------------------------
# MEMORY INFO
# -------------------------------------------------------
def _get_memory_info() -> Dict[str, Any]:
    if not psutil:
        return {}
    try:
        mem = psutil.virtual_memory()
        return {
            "total_ram": mem.total,
            "available_ram": mem.available,
            "used_ram": mem.used,
            "ram_percent": mem.percent,
        }
    except Exception:
        return {}


# -------------------------------------------------------
# DISK INFO
# -------------------------------------------------------
def _get_disk_info() -> Dict[str, Any]:
    disks = {}
    if not psutil:
        return disks

    try:
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                disks[part.device] = {
                    "mountpoint": part.mountpoint,
                    "fstype": part.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent,
                }
            except Exception:
                continue
    except Exception:
        pass

    return disks


# -------------------------------------------------------
# MAIN SYSTEM INFO (WITH WLAN FALLBACK)
# -------------------------------------------------------
def get_system_info() -> Dict[str, Any]:
    """
    Returns complete system information expected by backend admin agent format.
    Ensures wlan_info ALWAYS contains an IP so visualizer marks agent ONLINE.
    """

    try:
        # Collect WLAN & IP
        wlan = _get_wlan_interfaces()
        ip_addr = _get_ip_address()

        # ---------------------------------------------------
        # ⭐ CRITICAL FIX ⭐
        # If no WLAN interface detected (desktops, VMs),
        # force fallback interface using primary IP.
        # ---------------------------------------------------
        if not wlan and ip_addr not in ("unknown", None):
            wlan = [{
                "interface_name": "fallback",
                "type": "IPv4",
                "address": ip_addr,
                "netmask": None,
                "broadcast": None,
            }]

        # Compose final data block
        data = {
            "agent_id": platform.node(),
            "hostname": socket.gethostname(),
            "os_type": platform.system(),
            "os_version": platform.version(),
            "os_release": platform.release(),
            "cpu": _get_cpu_info(),
            "memory": _get_memory_info(),
            "disk": _get_disk_info(),
            "users": [getpass.getuser()],
            "machine_id": str(uuid.getnode()),
            "wlan_info": wlan,       # <-- ALWAYS NOT EMPTY NOW
            "ip": ip_addr,
        }

        return data

    except Exception as e:
        return {"error": str(e)}


# -------------------------------------------------------
# LOAD AGENT FROM ENV (.env)
# -------------------------------------------------------
def load_agent_from_env(env_path: str = None) -> Dict[str, str]:
    info = {}
    if load_dotenv and env_path:
        try:
            p = Path(env_path)
            if p.exists():
                load_dotenv(p)
        except Exception:
            pass

    import os
    agent_id = os.getenv("AGENT_ID") or os.getenv("AGENT")
    agent_name = os.getenv("AGENT_NAME") or os.getenv("AGENT")

    if agent_id:
        info["agent_id"] = agent_id
    if agent_name:
        info["agent_name"] = agent_name

    return info
