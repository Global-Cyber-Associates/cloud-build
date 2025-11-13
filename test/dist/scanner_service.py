#!/usr/bin/env python3
"""
ping_only_scanner_json_only.py

Outputs only JSON.
Ping-only discovery.
No logs or status messages printed.
Continuously runs every second.
"""

import ipaddress
import platform
import subprocess
import sys
import os
import json
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
import re
from typing import Tuple

try:
    import netifaces
except Exception:
    sys.exit("netifaces required. Install with: pip install netifaces")

# ---------------- Vendor Lookup ----------------
try:
    from mac_vendor_lookup import MacLookup
    MACLOOKUP_AVAILABLE = True
except Exception:
    MACLOOKUP_AVAILABLE = False

_mac_lookup = None
_vendor_cache = {}

def normalize_mac(mac):
    if mac is None:
        return None
    if isinstance(mac, bytes):
        try:
            mac = mac.decode()
        except Exception:
            mac = ''.join(f"{b:02x}" for b in mac)
    mac = str(mac).strip()
    if mac == "":
        return None
    if re.search(r'[:\-]', mac):
        parts = re.split(r'[:\-]', mac)
        if len(parts) == 6:
            return ":".join(p.zfill(2).lower() for p in parts)
    hexonly = re.sub(r'[^0-9a-fA-F]', '', mac)
    if len(hexonly) == 12:
        parts = [hexonly[i:i+2] for i in range(0, 12, 2)]
        return ":".join(p.lower() for p in parts)
    return mac.lower()

def safe_vendor_lookup(mac):
    mac_n = normalize_mac(mac)
    if not mac_n:
        return "Unknown"
    if mac_n in _vendor_cache:
        return _vendor_cache[mac_n]
    vendor = "Unknown"
    if MACLOOKUP_AVAILABLE:
        global _mac_lookup
        try:
            if _mac_lookup is None:
                _mac_lookup = MacLookup()
            vendor = _mac_lookup.lookup(mac_n)
        except Exception:
            vendor = "Unknown"
    _vendor_cache[mac_n] = vendor
    return vendor

# ---------------- Network detection ----------------
def auto_select_iface_and_network() -> Tuple[str, str, str, str]:
    ignore_prefixes = (
        "127.", "169.254.", "192.168.56.", "10.0.75.", "172.17.", "192.168.57.", "192.168.60."
    )

    def is_ignored_ip(ip):
        return any(ip.startswith(p) for p in ignore_prefixes)

    try:
        gws = netifaces.gateways()
        if netifaces.AF_INET in gws:
            gw_entry = gws[netifaces.AF_INET]
            gw_iface = None
            if isinstance(gw_entry, list) and gw_entry:
                gw_iface = gw_entry[0][1]
            elif isinstance(gw_entry, tuple) and len(gw_entry) >= 2:
                gw_iface = gw_entry[1]
            if gw_iface:
                addrs = netifaces.ifaddresses(gw_iface)
                if netifaces.AF_INET in addrs:
                    for entry in addrs[netifaces.AF_INET]:
                        ip = entry.get("addr")
                        netmask = entry.get("netmask")
                        if not ip or not netmask or is_ignored_ip(ip):
                            continue
                        try:
                            network = ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False)
                        except Exception:
                            continue
                        return gw_iface, ip, netmask, str(network)
    except Exception:
        pass

    for iface in netifaces.interfaces():
        try:
            addrs = netifaces.ifaddresses(iface)
        except Exception:
            continue
        if netifaces.AF_INET not in addrs:
            continue
        for entry in addrs[netifaces.AF_INET]:
            ip = entry.get("addr")
            netmask = entry.get("netmask")
            if not ip or not netmask or is_ignored_ip(ip):
                continue
            try:
                network = ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False)
                return iface, ip, netmask, str(network)
            except Exception:
                continue
    return None, None, None, None

# ---------------- Ping Sweep ----------------
def ping_host(ip, timeout=1):
    system = platform.system().lower()
    try:
        if system == "windows":
            cmd = ["ping", "-n", "1", "-w", str(int(max(1, timeout) * 1000)), ip]
        elif system == "darwin":
            cmd = ["ping", "-c", "1", "-W", str(max(1, int(round(timeout)))), ip]
        else:
            cmd = ["ping", "-c", "1", "-W", str(max(1, int(round(timeout)))), ip]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return res.returncode == 0
    except Exception:
        return False

def ping_sweep(network_cidr, max_workers=200, timeout=0.5):
    net = ipaddress.IPv4Network(network_cidr, strict=False)
    ips = [str(ip) for ip in net.hosts()]
    alive = []
    with ThreadPoolExecutor(max_workers=max(4, min(max_workers, 1000))) as exe:
        futures = {exe.submit(ping_host, ip, timeout): ip for ip in ips}
        for fut in as_completed(futures):
            ip = futures[fut]
            try:
                if fut.result():
                    alive.append(ip)
            except Exception:
                pass
    alive.sort(key=lambda s: tuple(int(x) for x in s.split(".")))
    return alive

# ---------------- JSON Output ----------------
def merge_and_dedupe(arp_map, ping_list):
    mac_map = OrderedDict()
    for ip, mac in arp_map.items():
        key = mac or f"unknown-mac:{ip}"
        if key not in mac_map:
            mac_map[key] = {"mac": mac, "ips": set()}
        mac_map[key]["ips"].add(ip)
    for ip in ping_list:
        if ip in arp_map:
            continue
        key = f"ping-only:{ip}"
        if key not in mac_map:
            mac_map[key] = {"mac": None, "ips": set()}
        mac_map[key]["ips"].add(ip)
    return mac_map

def results_to_json(mac_map):
    out = []
    for entry in mac_map.values():
        mac = entry["mac"]
        ips = sorted(entry["ips"])
        if mac:
            vendor = safe_vendor_lookup(mac)
            mobile = any(k in vendor.lower() for k in 
                         ["apple", "samsung", "xiaomi", "huawei", "oneplus", "pixel", "realme", "vivo"])
            out.append({
                "mac": mac,
                "ips": ips,
                "vendor": vendor,
                "mobile": mobile,
                "ping_only": False
            })
        else:
            out.append({
                "mac": None,
                "ips": ips,
                "vendor": "Unknown (ping-only)",
                "mobile": False,
                "ping_only": True
            })
    return out

# ---------------- Main ----------------
def main():
    iface, ip, netmask, network_cidr = auto_select_iface_and_network()
    if not network_cidr:
        print(json.dumps({"error": "Could not detect active network"}))
        return

    while True:
        ping_list = ping_sweep(network_cidr)
        arp_map = {}
        mac_map = merge_and_dedupe(arp_map, ping_list)
        out = results_to_json(mac_map)
        print(json.dumps(out, indent=2))
        sys.stdout.flush()
        time.sleep(5)

if __name__ == "__main__":
    main()
