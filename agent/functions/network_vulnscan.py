#!/usr/bin/env python3
"""
network_scanner_cli.py
Auto-detect local network (gateway/interface) and run local vulnerability scan.

Usage:
  python network_scanner_cli.py
  python network_scanner_cli.py 192.168.1.0/24
"""

import argparse
import asyncio
import json
import socket
import sys
import time
from datetime import datetime
from ipaddress import IPv4Network, ip_interface
from collections import OrderedDict

# Optional libraries
_have_netifaces = False
_have_psutil = False
try:
    import netifaces as _netifaces
    _have_netifaces = True
except Exception:
    _netifaces = None

try:
    import psutil as _psutil
    _have_psutil = True
except Exception:
    _psutil = None

try:
    from scapy.all import ARP, Ether, srp, conf
except Exception:
    ARP = Ether = srp = conf = None


COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 139, 143, 161, 443, 445, 3306, 3389, 5900, 8080]


# ------------------ Network Detection ------------------
def get_local_ip_by_socket():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return None


def cidr_from_ip_and_mask(ip_str, mask_str):
    try:
        if isinstance(mask_str, int) or (isinstance(mask_str, str) and mask_str.startswith("/")):
            prefix = int(str(mask_str).lstrip("/"))
            net = IPv4Network(f"{ip_str}/{prefix}", strict=False)
            return str(net.with_prefixlen)
        if isinstance(mask_str, str) and mask_str.count(".") == 3:
            iface = ip_interface(f"{ip_str}/{mask_str}")
            return str(iface.network.with_prefixlen)
    except Exception:
        pass
    return None


def detect_network_with_netifaces():
    try:
        gws = _netifaces.gateways()
        default = gws.get("default", {})
        gw_info = default.get(_netifaces.AF_INET)
        if not gw_info:
            return None
        gw_ip, iface = gw_info[0], gw_info[1]
        addrs = _netifaces.ifaddresses(iface).get(_netifaces.AF_INET, [])
        if not addrs:
            return None
        addr = addrs[0]
        ip = addr.get("addr")
        netmask = addr.get("netmask")
        cidr = cidr_from_ip_and_mask(ip, netmask)
        return cidr or f"{ip.rsplit('.', 1)[0]}.0/24"
    except Exception:
        return None


def detect_network_with_psutil():
    try:
        conns = _psutil.net_if_addrs()
        for iface, addrlist in conns.items():
            for addr in addrlist:
                if addr.family == socket.AF_INET and not addr.address.startswith("127."):
                    ip = addr.address
                    netmask = addr.netmask
                    cidr = cidr_from_ip_and_mask(ip, netmask)
                    return cidr or f"{ip.rsplit('.', 1)[0]}.0/24"
    except Exception:
        pass
    return None


def detect_network_fallback():
    ip = get_local_ip_by_socket()
    if not ip:
        return None
    base = ip.rsplit(".", 1)[0]
    return f"{base}.0/24"


def auto_detect_network():
    if _have_netifaces:
        try:
            cidr = detect_network_with_netifaces()
            if cidr:
                return cidr
        except Exception:
            pass
    if _have_psutil:
        try:
            cidr = detect_network_with_psutil()
            if cidr:
                return cidr
        except Exception:
            pass
    return detect_network_fallback()


# ------------------ Vulnerability Heuristics ------------------
def heuristic_flags(host_entry):
    """
    Analyze open ports and banners to identify vulnerabilities and assign impact levels.
    """
    findings = []
    open_ports = host_entry.get("open_ports", {})

    def add_finding(desc, impact):
        findings.append({"description": desc, "impact": impact})

    # SMB (445)
    if 445 in open_ports:
        add_finding("SMB open (445) — may expose file shares or SMBv1 vulnerabilities.", "High")

    # Telnet (23)
    if 23 in open_ports:
        add_finding("Telnet open (23) — insecure plaintext credentials.", "Critical")

    # RDP (3389)
    if 3389 in open_ports:
        add_finding("RDP open (3389) — check NLA and authentication policies.", "High")

    # VNC (5900)
    if 5900 in open_ports:
        add_finding("VNC open (5900) — may allow unauthenticated desktop access.", "High")

    # FTP (21)
    if 21 in open_ports:
        add_finding("FTP open (21) — insecure, may allow anonymous access.", "Medium")

    # HTTP/HTTPS ports
    for p in (80, 8080, 443):
        if p in open_ports:
            banner = open_ports[p].get("banner", "")
            if "Apache" in banner:
                if "2.2" in banner or "2.0" in banner:
                    add_finding(f"Outdated Apache server detected on port {p}.", "Medium")
                else:
                    add_finding(f"Web server (Apache) detected on port {p}.", "Low")
            elif "IIS" in banner:
                add_finding(f"Microsoft IIS web server detected on port {p}.", "Medium")
            elif "nginx" in banner.lower():
                add_finding(f"nginx server detected on port {p}.", "Low")
            elif "400 Bad Request" in banner:
                add_finding(f"Web service responded with error 400 on port {p}.", "Info")

    # SSH (22)
    if 22 in open_ports:
        banner = open_ports[22].get("banner", "")
        if "OpenSSH" in banner and "OpenSSH_" in banner:
            try:
                ver = banner.split("OpenSSH_")[1].split()[0]
                major = int(ver.split(".")[0])
                if major < 7:
                    add_finding(f"Old OpenSSH version detected ({ver}) — upgrade recommended.", "Medium")
                else:
                    add_finding(f"OpenSSH service detected ({ver}).", "Low")
            except Exception:
                add_finding("SSH service detected — ensure strong passwords/keys.", "Low")

    if not findings:
        add_finding("No obvious vulnerabilities detected.", "Info")

    return findings


# ------------------ Port Scanning ------------------
async def scan_host_ports(ip, ports, concurrency=200):
    sem = asyncio.Semaphore(concurrency)
    open_ports = {}

    async def worker(port):
        async with sem:
            try:
                fut = asyncio.open_connection(ip, port)
                reader, writer = await asyncio.wait_for(fut, timeout=1.5)
                writer.write(b"\r\n")
                await writer.drain()
                try:
                    data = await asyncio.wait_for(reader.read(1024), timeout=1.0)
                except Exception:
                    data = b""
                banner = data.decode(errors="ignore").strip() if data else ""
                open_ports[port] = {"banner": banner}
                writer.close()
                try:
                    await writer.wait_closed()
                except Exception:
                    pass
            except Exception:
                pass

    tasks = [asyncio.create_task(worker(p)) for p in ports]
    await asyncio.gather(*tasks)
    return open_ports


# ------------------ ARP Discovery ------------------
def arp_discover(network_cidr, timeout=2):
    if not ARP:
        return []
    conf.verb = 0
    try:
        net = IPv4Network(network_cidr, strict=False)
    except Exception:
        return []
    pkt = Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=str(net.with_prefixlen))
    try:
        ans, _ = srp(pkt, timeout=timeout, verbose=0)
    except PermissionError:
        raise PermissionError("ARP discovery requires elevated privileges.")
    hosts = []
    for snd, rcv in ans:
        hosts.append({"ip": rcv.psrc, "mac": rcv.hwsrc})
    return hosts


# ------------------ Network Scanner ------------------
async def scan_network(network_cidr, ports=COMMON_PORTS):
    start = time.time()
    hosts = []
    try:
        discovered = arp_discover(network_cidr)
    except PermissionError:
        print("ARP discovery requires elevated privileges. Falling back to TCP-probe discovery.")
        discovered = []

    if not discovered:
        net = IPv4Network(network_cidr, strict=False)
        ips = [str(ip) for ip in net.hosts()]

        async def probe(ip):
            for p in (80, 443, 22):
                try:
                    fut = asyncio.open_connection(ip, p)
                    r, w = await asyncio.wait_for(fut, timeout=0.6)
                    w.close()
                    try:
                        await w.wait_closed()
                    except Exception:
                        pass
                    return ip
                except Exception:
                    pass
            return None

        tasks = [asyncio.create_task(probe(ip)) for ip in ips]
        results = await asyncio.gather(*tasks)
        discovered = [{"ip": r, "mac": ""} for r in results if r]

    for entry in discovered:
        ip = entry["ip"]
        host_entry = {"ip": ip, "mac": entry.get("mac", ""), "open_ports": {}, "vuln_flags": [], "impact_level": "Info"}
        open_ports = await scan_host_ports(ip, ports)
        host_entry["open_ports"] = open_ports
        host_entry["vuln_flags"] = heuristic_flags(host_entry)
        # Compute overall impact level
        impacts = [f["impact"] for f in host_entry["vuln_flags"]]
        levels = ["Info", "Low", "Medium", "High", "Critical"]
        if impacts:
            host_entry["impact_level"] = max(impacts, key=lambda i: levels.index(i))
        hosts.append(host_entry)

    elapsed = time.time() - start
    return {
        "ok": True,
        "scanned_at": datetime.utcnow().isoformat() + "Z",
        "network": network_cidr,
        "duration_seconds": round(elapsed, 2),
        "hosts": hosts,
    }


# ------------------ CLI Entry ------------------
def main():
    parser = argparse.ArgumentParser(description="Auto-detect local network and run vulnerability scan.")
    parser.add_argument("network", nargs="?", help="Target network (optional)")
    args = parser.parse_args()

    network = args.network or auto_detect_network()
    if not network:
        print(json.dumps({"ok": False, "error": "Unable to detect network."}))
        sys.exit(1)

    print(json.dumps(asyncio.run(scan_network(network))))


if __name__ == "__main__":
    main()
