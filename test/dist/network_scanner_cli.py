#!/usr/bin/env python3
"""
network_scanner_cli.py

Usage:
  python network_scanner_cli.py            # auto-detect best LAN interface/network
  python network_scanner_cli.py --auto     # same as default (kept for backward compatibility)
  python network_scanner_cli.py --network 192.168.1.0/24
  python network_scanner_cli.py --update-vendors  # refresh mac-vendor DB first
  python network_scanner_cli.py --no-arp   # ping-only
  python network_scanner_cli.py --list-ifaces
  python network_scanner_cli.py --iface <iface-name>
  python network_scanner_cli.py --json
"""

import argparse
import ipaddress
import platform
import re
import socket
import sys
import os
import json
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# network / iface detection
try:
    import netifaces
except Exception:
    sys.exit("netifaces required. Install with: pip install netifaces")

# scapy (required for ARP)
try:
    from scapy.all import ARP, Ether, srp, conf, sr1, ICMP, get_if_list, UDP, IP, send, sr
except Exception:
    sys.exit("scapy required. Install with: pip install scapy")

# mac vendor lookup (optional)
try:
    from mac_vendor_lookup import MacLookup
    MACLOOKUP_AVAILABLE = True
except Exception:
    MACLOOKUP_AVAILABLE = False

# ---------- Vendor lookup helpers ----------
_mac_lookup = None
_vendor_cache = {}

def normalize_mac(mac):
    """Normalize MAC to form 'aa:bb:cc:dd:ee:ff' (lowercase). Accepts bytes or strings."""
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
    """Return vendor string or 'Unknown' and never raise. Uses an in-memory cache."""
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

# ---------- Interface & network detection ----------
def auto_select_iface_and_network():
    """
    Return (iface_name, ip, netmask, network_cidr) for the best LAN interface.
    Strategy:
      1. Try system default gateway interface (works on most platforms).
      2. Prefer interfaces with names suggesting LAN/WiFi (wlan, wifi, eth, en, Ethernet, Wi-Fi).
      3. Skip loopback, link-local and common virtual subnets (VirtualBox/VMware/Docker).
      4. Fall back to first valid candidate found.
    Returns (None, None, None, None) if no valid interface found.
    """
    ignore_prefixes = (
        "127.",        # loopback
        "169.254.",    # link-local
        "192.168.56.", # VirtualBox host-only
        "10.0.75.",    # Windows NAT / older VirtualBox
        "172.17.",     # docker default bridge
        "192.168.57.", # some VM nets
        "192.168.60.", # example other vm nets
    )
    prefer_name_prefixes = ("wlan", "wifi", "eth", "en", "ethernet", "wi-fi", "wi_fi", "wl")
    candidates = []

    def is_ignored_ip(ip):
        return any(ip.startswith(p) for p in ignore_prefixes)

    # 1) Try default gateway interface (best guess)
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
                        if not ip or not netmask:
                            continue
                        if is_ignored_ip(ip):
                            break
                        try:
                            network = ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False)
                        except Exception:
                            break
                        return gw_iface, ip, netmask, str(network)
    except Exception:
        pass

    # 2) Iterate all interfaces and collect candidates while preferring LAN-like names
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
            if not ip or not netmask:
                continue
            if is_ignored_ip(ip):
                continue
            if ip.startswith("127.") or ip.startswith("169.254."):
                continue
            try:
                network = ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False)
            except Exception:
                continue
            if any(iface.lower().startswith(pref) for pref in prefer_name_prefixes):
                return iface, ip, netmask, str(network)
            candidates.append((iface, ip, netmask, str(network)))

    if candidates:
        return candidates[0]

    return None, None, None, None

def list_interfaces():
    """Return a friendly list of interfaces available (netifaces + Scapy names)."""
    scapy_ifaces = get_if_list()
    infos = []
    for iface in netifaces.interfaces():
        addrs = netifaces.ifaddresses(iface)
        ip = None
        netmask = None
        if netifaces.AF_INET in addrs:
            entry = addrs[netifaces.AF_INET][0]
            ip = entry.get("addr")
            netmask = entry.get("netmask")
        possible_scapy = [s for s in scapy_ifaces if iface.lower() in s.lower() or s.lower() in iface.lower()]
        scapy_match = possible_scapy[0] if possible_scapy else None
        infos.append({"netifaces_name": iface, "scapy_name": scapy_match, "ip": ip, "netmask": netmask})
    return infos

# ---------- Scapy iface binding helper ----------
def _attempt_bind_iface(iface_name):
    """
    Attempt to set scapy conf.iface to a matching scapy interface name.
    Returns the actual iface used (or None if none set).
    """
    if not iface_name:
        return None
    scapy_list = get_if_list()
    for s in scapy_list:
        if s == iface_name:
            try:
                conf.iface = s
                return s
            except Exception:
                pass
    for s in scapy_list:
        if iface_name.lower() in s.lower() or s.lower() in iface_name.lower():
            try:
                conf.iface = s
                return s
            except Exception:
                pass
    try:
        conf.iface = iface_name
        return iface_name
    except Exception:
        return None

# ---------- ARP scan ----------
def arp_scan(network_cidr, iface=None, timeout=2):
    """Perform ARP scan, return dict ip->mac (mac normalized)."""
    print(f"[*] Attempting ARP scan on {network_cidr} (iface={iface}) ...")
    packet = Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=str(network_cidr))
    kwargs = {"timeout": timeout, "verbose": False}
    actual_iface = None
    if iface:
        try:
            actual_iface = _attempt_bind_iface(iface)
            if actual_iface:
                kwargs["iface"] = actual_iface
        except Exception:
            pass
    try:
        answered = srp(packet, **kwargs)[0]
    except Exception as e:
        raise RuntimeError(f"ARP srp error: {e}")
    result = {}
    for sent, received in answered:
        ip = received.psrc
        mac = normalize_mac(getattr(received, "hwsrc", None))
        result[ip] = mac
    return result

# ---------- TCP connect fallback (no root required) ----------
def tcp_connect_check(ip, ports=(80, 443, 8080, 8008, 554, 22, 5353), timeout=0.4):
    """
    Try TCP connect to a list of common ports. Return True if any port connects.
    Uses connect_ex with a short timeout; this works without raw sockets / root.
    """
    for port in ports:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(max(0.05, timeout))
            ret = s.connect_ex((ip, port))
            s.close()
            if ret == 0:
                return True
        except Exception:
            pass
    return False

# ---------- UDP probes (SSDP m-search & simple mDNS query) ----------
def udp_ssdp_probe(ip, timeout=0.6):
    """
    Send an SSDP M-SEARCH to the target IP:1900 and wait for UDP replies.
    Returns True if any response received.
    """
    msg = "\r\n".join([
        'M-SEARCH * HTTP/1.1',
        'HOST:239.255.255.250:1900',
        'MAN:"ssdp:discover"',
        'MX:1',
        'ST:ssdp:all',
        '', ''
    ]).encode('utf-8')
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(timeout)
        # send to target directly
        s.sendto(msg, (ip, 1900))
        try:
            data, addr = s.recvfrom(2048)
            s.close()
            if data:
                return True
        except socket.timeout:
            s.close()
            return False
    except Exception:
        return False

def udp_mdns_probe(ip, timeout=0.6):
    """
    Send a very small UDP packet to 5353 asking for any response.
    Some devices reply to mDNS queries or to a simple datagram.
    This is a best-effort; not a fully formatted DNS-SD query.
    """
    # A proper mDNS query would require building DNS query bytes.
    # Many devices respond to an empty payload probe or to a simple query string.
    probe_payload = b'\x00' * 12  # minimal payload; best-effort
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(timeout)
        s.sendto(probe_payload, (ip, 5353))
        try:
            data, addr = s.recvfrom(2048)
            s.close()
            if data:
                return True
        except socket.timeout:
            s.close()
            return False
    except Exception:
        return False

def udp_probe(ip, timeout=0.6):
    """Try SSDP then mDNS; return True if any UDP probe gets a reply."""
    try:
        if udp_ssdp_probe(ip, timeout=timeout):
            return True
    except Exception:
        pass
    try:
        if udp_mdns_probe(ip, timeout=timeout):
            return True
    except Exception:
        pass
    return False

# ---------- Ping (ICMP) ----------
def ping_host(ip, timeout=1):
    """Ping a single host; returns True if ping responds. Cross-platform wrapper."""
    param = "-n" if platform.system().lower() == "windows" else "-c"
    if platform.system().lower() == "windows":
        cmd = ["ping", param, "1", "-w", str(int(timeout*1000)), ip]
    else:
        # Use -W with int seconds on Linux; on macOS -W semantics differ but this is best-effort.
        cmd = ["ping", param, "1", "-W", str(max(1, int(timeout))), ip]
    import subprocess
    try:
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return res.returncode == 0
    except Exception:
        return False

# ---------- Enhanced host discovery (ICMP -> TCP -> UDP fallback) ----------
def ping_sweep(network_cidr, max_workers=200, timeout=0.5, tcp_ports=None, udp_probe_enabled=True):
    """
    Host discovery:
      1) ICMP ping
      2) TCP connect to common ports (fast, non-root)
      3) UDP probes (SSDP/mDNS) if enabled (may require router to allow)
    Returns list of ips that appear alive.
    """
    print(f"[*] Running enhanced host discovery on {network_cidr} ...")
    if tcp_ports is None:
        tcp_ports = (80, 443, 8080, 8008, 554, 22, 5353)

    alive = []
    net = ipaddress.IPv4Network(network_cidr, strict=False)
    ips = [str(ip) for ip in net.hosts()]

    def check(ip):
        try:
            if ping_host(ip, timeout=timeout):
                return ip
        except Exception:
            pass
        try:
            if tcp_connect_check(ip, ports=tcp_ports, timeout=timeout):
                return ip
        except Exception:
            pass
        if udp_probe_enabled:
            try:
                if udp_probe(ip, timeout=timeout):
                    return ip
            except Exception:
                pass
        return None

    with ThreadPoolExecutor(max_workers=max_workers) as exe:
        futures = {exe.submit(check, ip): ip for ip in ips}
        for fut in as_completed(futures):
            ip = futures[fut]
            try:
                res = fut.result()
                if res:
                    alive.append(res)
            except Exception:
                pass
    return alive

# ---------- Merge & dedupe ----------
def merge_and_dedupe(arp_map, ping_list):
    """
    Merge arp_map (ip->mac) and ping_list (ips) into OrderedDict keyed by mac or 'ping-only:ip'
    Returns OrderedDict { key -> {mac:..., ips:set(...) } }
    """
    mac_map = OrderedDict()
    # ARP entries first
    for ip, mac in arp_map.items():
        key = mac or f"unknown-mac:{ip}"
        if key not in mac_map:
            mac_map[key] = {"mac": mac, "ips": set()}
        mac_map[key]["ips"].add(ip)
    # Ping-only entries
    for ip in ping_list:
        if ip in arp_map:
            continue
        key = f"ping-only:{ip}"
        if key not in mac_map:
            mac_map[key] = {"mac": None, "ips": set()}
        mac_map[key]["ips"].add(ip)
    return mac_map

def print_results(mac_map):
    print("\nDetected devices (unique by MAC / ping-only):\n")
    header = "{:<22} {:<20} {:<30} {:<8}".format("IP(s)", "MAC", "Vendor", "Mobile")
    print(header)
    print("-" * len(header))
    for entry in mac_map.values():
        mac = entry["mac"]
        ips = ", ".join(sorted(entry["ips"]))
        if mac:
            vendor = safe_vendor_lookup(mac)
            mobile = "YES" if any(k in vendor.lower() for k in ["apple", "samsung", "xiaomi", "huawei", "oneplus", "pixel", "realme", "vivo"]) else ""
            print("{:<22} {:<20} {:<30} {:<8}".format(ips, mac, vendor, mobile))
        else:
            print("{:<22} {:<20} {:<30} {:<8}".format(ips, "-", "Unknown (ping-only)", ""))

def results_to_json(mac_map):
    """Convert mac_map structure to JSON-friendly list."""
    out = []
    for entry in mac_map.values():
        mac = entry["mac"]
        ips = sorted(entry["ips"])
        if mac:
            vendor = safe_vendor_lookup(mac)
            mobile = any(k in vendor.lower() for k in ["apple", "samsung", "xiaomi", "huawei", "oneplus", "pixel", "realme", "vivo"])
            out.append({"mac": mac, "ips": ips, "vendor": vendor, "mobile": mobile, "ping_only": False})
        else:
            out.append({"mac": None, "ips": ips, "vendor": "Unknown (ping-only)", "mobile": False, "ping_only": True})
    return out

# ---------- Privilege check ----------
def check_privileges():
    """Return (is_elevated:bool, message:str)."""
    try:
        if platform.system().lower() == "windows":
            import ctypes
            try:
                is_admin = ctypes.windll.shell32.IsUserAnAdmin() != 0
            except Exception:
                is_admin = False
        else:
            is_admin = (os.geteuid() == 0)
    except Exception:
        is_admin = False
    if not is_admin:
        msg = "[!] Warning: not running as Administrator/root. ARP & low-level scanning may fail or be incomplete."
    else:
        msg = "[*] Running with elevated privileges."
    return is_admin, msg

# ---------- Main ----------
def main():
    p = argparse.ArgumentParser(description="Safe network scanner with robust vendor lookup and TCP/UDP fallbacks")
    p.add_argument("--auto", action="store_true", help="auto-select interface (default behavior)")
    p.add_argument("--network", type=str, help="explicit network CIDR (overrides auto-detect)")
    p.add_argument("--update-vendors", action="store_true", help="update local mac-vendor DB before scanning (requires internet)")
    p.add_argument("--no-arp", action="store_true", help="skip ARP scan (ping-only)")
    p.add_argument("--iface", type=str, help="force interface name (netifaces name or scapy name)")
    p.add_argument("--json", action="store_true", help="output results in JSON format")
    p.add_argument("--list-ifaces", action="store_true", help="list detected interfaces (netifaces names + scapy matches) and exit")
    p.add_argument("--udp-probes", action="store_true", help="enable UDP SSDP/mDNS probes (may require privileges and network support)")
    p.add_argument("--tcp-ports", type=str, help="comma-separated TCP ports for fallback (e.g. 80,443,22)")
    args = p.parse_args()

    is_elevated, msg = check_privileges()
    print(msg)

    if args.update_vendors:
        if not MACLOOKUP_AVAILABLE:
            print("[!] mac-vendor-lookup not installed. Install with: pip install mac-vendor-lookup")
        else:
            print("[*] Updating mac vendor DB (this may take a moment)...")
            try:
                MacLookup().update_vendors()
                print("[+] Vendor DB updated.")
            except Exception as e:
                print("[!] update_vendors failed:", e)

    if args.list_ifaces:
        infos = list_interfaces()
        print("\nDetected interfaces (netifaces name -> scapy match) and IPs:\n")
        for i in infos:
            print("netifaces: {:<30} scapy_match: {:<25} ip: {:<15} netmask: {}".format(
                i["netifaces_name"], str(i["scapy_name"]) if i["scapy_name"] else "-", i["ip"] if i["ip"] else "-", i["netmask"] if i["netmask"] else "-"
            ))
        return

    iface = None; ip = None; netmask = None; network_cidr = None
    if args.iface:
        iface = args.iface

    if args.network:
        network_cidr = args.network
        print(f"Using explicit network: {network_cidr}")
    else:
        iface, ip, netmask, network_cidr = auto_select_iface_and_network()
        if not network_cidr:
            print("[!] Could not detect active interface/network. Provide --network explicitly.")
            return
        print(f"Interface chosen: {iface}  IP: {ip}  Netmask: {netmask}")
        print(f"Detected network: {network_cidr}")

    tcp_ports = None
    if args.tcp_ports:
        try:
            tcp_ports = tuple(int(p.strip()) for p in args.tcp_ports.split(",") if p.strip())
        except Exception:
            tcp_ports = None

    arp_map = {}
    ping_list = []

    if not args.no_arp:
        try:
            # attempt to bind scapy to interface if provided - improves ARP reliability on Windows
            if iface:
                _attempt_bind_iface(iface)
            arp_map = arp_scan(network_cidr, iface=iface, timeout=2)
            if not arp_map:
                print("[!] ARP scan returned no results (will run enhanced host discovery).")
        except Exception as e:
            print("[!] ARP scan error:", e)
    else:
        print("[*] ARP scan skipped (ping-only mode).")

    try:
        ping_list = ping_sweep(network_cidr, tcp_ports=tcp_ports, udp_probe_enabled=args.udp_probes)
    except Exception as e:
        print("[!] Host discovery error:", e)
        ping_list = []

    mac_map = merge_and_dedupe(arp_map, ping_list)

    if args.json:
        out = results_to_json(mac_map)
        print(json.dumps(out, indent=2))
    else:
        print_results(mac_map)

if __name__ == "__main__":
    main()
