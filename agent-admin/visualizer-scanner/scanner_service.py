#!/usr/bin/env python3
"""
Fast scanner_service.py — prints exactly one JSON array per cycle (no extra logs).
Hybrid method:
 - UDP nudges to common discovery ports
 - Read arp -a
 - Fast TCP connect probes for common ports
 - Print JSON array of devices each cycle
"""

import ipaddress
import json
import time
import socket
import subprocess
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
import netifaces

# CONFIG (tune for speed)
UDP_PORTS = [5353, 1900, 137]        # mDNS, SSDP, NetBIOS
TCP_PORTS = [80, 443, 22, 139, 445]  # quick TCP probes
TCP_TIMEOUT = 0.12
UDP_SEND_TIMEOUT = 0.01
THREADS = 200
INITIAL_DELAY = 0.8
FAST_DELAY = 0.35
CYCLE_INTERVAL = 2.0
RANDOM_SAMPLE_PER_CYCLE = 30
NEIGHBOR_RANGE = 2

def detect_network():
    try:
        gws = netifaces.gateways()
        if netifaces.AF_INET in gws:
            entry = gws[netifaces.AF_INET][0]
            iface = entry[1]
            addrs = netifaces.ifaddresses(iface).get(netifaces.AF_INET, [])
            for a in addrs:
                ip = a.get("addr")
                nm = a.get("netmask")
                if ip and nm:
                    cidr = str(ipaddress.IPv4Network(f"{ip}/{nm}", False))
                    return iface, ip, nm, cidr
    except:
        pass
    # fallback any interface
    for iface in netifaces.interfaces():
        addrs = netifaces.ifaddresses(iface).get(netifaces.AF_INET, [])
        for a in addrs:
            ip = a.get("addr")
            nm = a.get("netmask")
            if ip and nm:
                cidr = str(ipaddress.IPv4Network(f"{ip}/{nm}", False))
                return iface, ip, nm, cidr
    return None, None, None, None

def udp_wake_ips(ips):
    def _send(ip):
        for port in UDP_PORTS:
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.settimeout(UDP_SEND_TIMEOUT)
                s.sendto(b"", (ip, port))
                s.close()
            except:
                pass
    with ThreadPoolExecutor(max_workers=THREADS) as ex:
        ex.map(_send, ips)

def tcp_probe(ip):
    for port in TCP_PORTS:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(TCP_TIMEOUT)
        try:
            if s.connect_ex((ip, port)) == 0:
                s.close()
                return True
        except:
            pass
        finally:
            try:
                s.close()
            except:
                pass
    return False

def read_arp_table(cidr):
    try:
        out = subprocess.check_output("arp -a", shell=True, text=True)
    except Exception:
        return set()
    net = ipaddress.ip_network(cidr, False)
    res = set()
    for line in out.splitlines():
        parts = line.strip().split()
        if not parts:
            continue
        ip = parts[0]
        try:
            a = ipaddress.IPv4Address(ip)
            if a in net and not a.is_multicast and not a.is_loopback and a != net.broadcast_address:
                res.add(str(a))
        except:
            continue
    return res

def neighbors_of(ip_str, cidr, rng=NEIGHBOR_RANGE):
    try:
        ip = ipaddress.IPv4Address(ip_str)
        net = ipaddress.ip_network(cidr, False)
    except:
        return []
    base = int(ip)
    out = []
    for d in range(-rng, rng+1):
        if d == 0:
            continue
        cand = ipaddress.IPv4Address(base + d)
        if cand in net:
            out.append(str(cand))
    return out

def initial_full_scan(cidr, local_ip):
    net = ipaddress.ip_network(cidr, False)
    ips = [str(h) for h in net.hosts()]
    udp_wake_ips(ips)
    time.sleep(INITIAL_DELAY)
    arp_alive = read_arp_table(cidr)
    # TCP probe (concurrent)
    alive_tcp = set()
    with ThreadPoolExecutor(max_workers=THREADS) as ex:
        futures = {ex.submit(tcp_probe, ip): ip for ip in ips}
        for fut in as_completed(futures):
            try:
                if fut.result():
                    alive_tcp.add(futures[fut])
            except:
                pass
    combined = set(arp_alive) | alive_tcp
    combined.add(local_ip)
    return combined

def incremental_scan(previous_alive, cidr, local_ip):
    net = ipaddress.ip_network(cidr, False)
    all_hosts = [str(h) for h in net.hosts()]
    target = set(previous_alive)
    for ip in list(previous_alive):
        for n in neighbors_of(ip, cidr):
            target.add(n)
    remaining = [h for h in all_hosts if h not in target]
    if remaining:
        sample = random.sample(remaining, min(RANDOM_SAMPLE_PER_CYCLE, len(remaining)))
        target.update(sample)
    udp_wake_ips(list(target))
    time.sleep(FAST_DELAY)
    arp_alive = read_arp_table(cidr)
    alive_tcp = set()
    with ThreadPoolExecutor(max_workers=THREADS) as ex:
        futures = {ex.submit(tcp_probe, ip): ip for ip in target}
        for fut in as_completed(futures):
            try:
                if fut.result():
                    alive_tcp.add(futures[fut])
            except:
                pass
    combined = set(arp_alive) | alive_tcp
    combined.add(local_ip)
    return combined

def main():
    iface, local_ip, netmask, cidr = detect_network()
    if not cidr:
        # print empty JSON to indicate no network
        print(json.dumps([]), flush=True)
        return
    # initial
    print(json.dumps({"scanner":"started","cidr":cidr}), flush=True)
    try:
        prev = initial_full_scan(cidr, local_ip)
    except:
        prev = {local_ip}
    # emit first list
    devices = [{"ip": ip, "mac": None, "vendor": None} for ip in sorted(prev, key=lambda s: tuple(map(int, s.split('.'))))]
    print(json.dumps(devices), flush=True)
    # loop
    while True:
        start = time.time()
        try:
            alive = incremental_scan(prev, cidr, local_ip)
        except:
            alive = prev
        devs = [{"ip": ip, "mac": None, "vendor": None} for ip in sorted(alive, key=lambda s: tuple(map(int, s.split('.'))))]
        print(json.dumps(devs), flush=True)
        prev = alive
        elapsed = time.time() - start
        to_wait = max(0, CYCLE_INTERVAL - elapsed)
        time.sleep(to_wait)

if __name__ == "__main__":
    main()
