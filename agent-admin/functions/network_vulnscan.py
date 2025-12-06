#!/usr/bin/env python3
"""
Pure-Python LAN scanner — single EXE friendly.
- No Nmap
- No Scapy
- No DLLs
- Works in PyInstaller onefile
- Windows 10+ compatible
- Strict filtering: no .255, no out-of-network IPs
"""

import argparse
import asyncio
import json
import re
import socket
import subprocess
import sys
import time
from datetime import datetime
from ipaddress import IPv4Network

COMMON_PORTS = [
    21, 22, 23, 25, 53, 80, 110, 139, 143,
    161, 443, 445, 3306, 3389, 5900, 8080
]

DISCOVERY_PORTS = [80, 443, 22]
DISCOVERY_TIMEOUT = 0.6
PORT_TIMEOUT = 1.5
BANNER_READ_BYTES = 1024


# ------------------ Network Detection ------------------
def get_local_ip_by_socket():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return None


def auto_detect_network():
    ip = get_local_ip_by_socket()
    if not ip:
        return None
    base = ip.rsplit(".", 1)[0]
    return f"{base}.0/24"


# ------------------ ARP Parsing ------------------
def parse_arp_windows(output):
    hosts = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F\-:]{7,})\s+\w+", line)
        if m:
            ip = m.group(1)
            mac = m.group(2).replace("-", ":").lower()
            hosts.append({"ip": ip, "mac": mac})
    return hosts


def parse_arp_unix(output):
    hosts = []
    for line in output.splitlines():
        line = line.strip()

        # ip neigh format
        m = re.match(r"(\d+\.\d+\.\d+\.\d+).*lladdr\s+([0-9a-fA-F:]{7,})", line)
        if m:
            hosts.append({"ip": m.group(1), "mac": m.group(2).lower()})
            continue

        # arp -n style
        m2 = re.match(r"(\d+\.\d+\.\d+\.\d+).*?([0-9a-fA-F:]{7,})\s", line)
        if m2:
            hosts.append({"ip": m2.group(1), "mac": m2.group(2).lower()})
    return hosts


def arp_discover_windows():
    try:
        out = subprocess.check_output(["arp", "-a"], text=True, stderr=subprocess.DEVNULL)
        return parse_arp_windows(out)
    except:
        return []


def arp_discover_unix():
    try:
        out = subprocess.check_output(["ip", "neigh"], text=True, stderr=subprocess.DEVNULL)
        h = parse_arp_unix(out)
        if h:
            return h
    except:
        pass
    try:
        out = subprocess.check_output(["arp", "-n"], text=True, stderr=subprocess.DEVNULL)
        return parse_arp_unix(out)
    except:
        return []


def arp_discover(network_cidr):
    if sys.platform.startswith("win"):
        return arp_discover_windows()
    return arp_discover_unix()


# ------------------ Strict IP Filtering ------------------
def ip_in_network(ip_str, network_obj):
    try:
        # Represent IP as /32 network and check if it's inside network_obj
        ip = IPv4Network(f"{ip_str}/32")
        return ip.subnet_of(network_obj)
    except:
        return False


def filter_invalid_hosts(hosts, network_obj):
    valid = []
    broadcast = str(network_obj.broadcast_address)

    for h in hosts:
        ip = h.get("ip")
        if not ip:
            continue
        if ip == broadcast:
            continue
        if ip_in_network(ip, network_obj):
            valid.append(h)

    return valid


# ------------------ TCP Probe Discovery ------------------
async def tcp_probe_ip(ip, ports=DISCOVERY_PORTS, timeout=DISCOVERY_TIMEOUT):
    for p in ports:
        try:
            fut = asyncio.open_connection(ip, p)
            r, w = await asyncio.wait_for(fut, timeout=timeout)
            try:
                w.close()
                await w.wait_closed()
            except:
                pass
            return ip
        except:
            pass
    return None


async def discover_by_tcp(network_cidr, concurrency=200):
    net = IPv4Network(network_cidr, strict=False)
    ips = [str(ip) for ip in net.hosts()]  # net.hosts() excludes broadcast correctly

    sem = asyncio.Semaphore(concurrency)
    results = []

    async def worker(ip):
        async with sem:
            r = await tcp_probe_ip(ip)
            if r:
                results.append(r)

    tasks = [asyncio.create_task(worker(ip)) for ip in ips]
    await asyncio.gather(*tasks)

    return [{"ip": ip, "mac": ""} for ip in results]


# ------------------ Port Scanning ------------------
async def scan_host_ports(ip, ports, concurrency=200, timeout=PORT_TIMEOUT):
    sem = asyncio.Semaphore(concurrency)
    open_ports = {}

    async def worker(port):
        async with sem:
            try:
                fut = asyncio.open_connection(ip, port)
                reader, writer = await asyncio.wait_for(fut, timeout=timeout)

                banner = ""
                try:
                    writer.write(b"\r\n")
                    await writer.drain()
                    data = await asyncio.wait_for(reader.read(BANNER_READ_BYTES), timeout=0.8)
                    if data:
                        banner = data.decode(errors="ignore").strip()
                except:
                    pass

                open_ports[port] = {"banner": banner}

                try:
                    writer.close()
                    await writer.wait_closed()
                except:
                    pass

            except:
                pass

    tasks = [asyncio.create_task(worker(p)) for p in ports]
    await asyncio.gather(*tasks)

    return open_ports


# ------------------ Vulnerability Heuristics ------------------
def heuristic_flags(host_entry):
    findings = []
    open_ports = host_entry.get("open_ports", {})

    def add(desc, impact):
        findings.append({"description": desc, "impact": impact})

    if 445 in open_ports:
        add("SMB open (445) — possible SMBv1 risks.", "High")

    if 23 in open_ports:
        add("Telnet open (23) — plaintext credentials.", "Critical")

    if 3389 in open_ports:
        add("RDP open (3389) — verify NLA.", "High")

    if 5900 in open_ports:
        add("VNC open (5900).", "High")

    if 21 in open_ports:
        add("FTP open (21) — insecure.", "Medium")

    for p in (80, 8080, 443):
        if p in open_ports:
            banner = open_ports[p].get("banner", "")
            if "Apache" in banner:
                add(f"Apache server detected ({banner}).", "Low")
            elif "IIS" in banner:
                add(f"Microsoft IIS detected ({banner}).", "Medium")
            elif "nginx" in banner.lower():
                add(f"nginx detected ({banner}).", "Low")

    if 22 in open_ports:
        banner = open_ports[22].get("banner", "")
        if "OpenSSH_" in banner:
            try:
                ver = banner.split("OpenSSH_")[1].split()[0]
                major = int(ver.split(".")[0])
                if major < 7:
                    add(f"Old OpenSSH version {ver}.", "Medium")
                else:
                    add(f"OpenSSH detected {ver}.", "Low")
            except:
                add("SSH detected.", "Low")

    if not findings:
        add("No obvious vulnerabilities detected.", "Info")

    return findings


# ------------------ Scan Orchestration ------------------
async def scan_network_async(network_cidr, ports=COMMON_PORTS, concurrency=200):
    start = time.time()
    net = IPv4Network(network_cidr, strict=False)

    # --- ARP discovery ---
    discovered = arp_discover(network_cidr)
    discovered = filter_invalid_hosts(discovered, net)

    # --- TCP fallback ---
    if not discovered:
        tcp_hosts = await discover_by_tcp(network_cidr, concurrency=concurrency)
        discovered = filter_invalid_hosts(tcp_hosts, net)

    # Dedupe
    seen = set()
    unique = []
    for h in discovered:
        ip = h["ip"]
        if ip not in seen:
            seen.add(ip)
            unique.append(h)

    # --- Port scanning ---
    hosts = []
    for h in unique:
        ip = h["ip"]
        host_entry = {
            "ip": ip,
            "mac": h.get("mac", ""),
            "open_ports": {},
            "vuln_flags": [],
            "impact_level": "Info",
        }

        open_ports = await scan_host_ports(ip, ports, concurrency=concurrency)
        host_entry["open_ports"] = open_ports
        host_entry["vuln_flags"] = heuristic_flags(host_entry)

        # compute impact level
        impacts = [f["impact"] for f in host_entry["vuln_flags"]]
        levels = ["Info", "Low", "Medium", "High", "Critical"]
        if impacts:
            host_entry["impact_level"] = max(impacts, key=lambda x: levels.index(x))

        hosts.append(host_entry)

    return {
        "ok": True,
        "scanned_at": datetime.utcnow().isoformat() + "Z",
        "network": network_cidr,
        "duration_seconds": round(time.time() - start, 2),
        "hosts": hosts
    }


def scan_network(network_cidr, ports=COMMON_PORTS, concurrency=200):
    return asyncio.run(scan_network_async(network_cidr, ports=ports, concurrency=concurrency))


# ------------------ CLI ------------------
def main():
    parser = argparse.ArgumentParser(description="Pure Python LAN vulnerability scanner")
    parser.add_argument("network", nargs="?", help="Target CIDR (optional)")
    parser.add_argument("--ports", help="Comma-separated ports")
    parser.add_argument("--concurrency", "-c", type=int, default=200)
    args = parser.parse_args()

    network = args.network or auto_detect_network()
    if not network:
        print(json.dumps({"ok": False, "error": "Unable to detect network."}))
        sys.exit(1)

    if args.ports:
        try:
            ports = [int(x.strip()) for x in args.ports.split(",") if x.strip()]
        except:
            ports = COMMON_PORTS
    else:
        ports = COMMON_PORTS

    result = scan_network(network, ports=ports, concurrency=args.concurrency)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
