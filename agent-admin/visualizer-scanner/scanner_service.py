#!/usr/bin/env python3
import ipaddress
import platform
import subprocess
import sys
import os
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import netifaces


def detect_network():
    try:
        gws = netifaces.gateways()
        if netifaces.AF_INET in gws:
            gw = gws[netifaces.AF_INET][0]
            iface = gw[1]
            addrs = netifaces.ifaddresses(iface).get(netifaces.AF_INET, [])
            for entry in addrs:
                ip = entry.get("addr")
                nm = entry.get("netmask")
                if ip and nm:
                    return iface, ip, nm, str(ipaddress.IPv4Network(f"{ip}/{nm}", False))
    except:
        pass

    for iface in netifaces.interfaces():
        addrs = netifaces.ifaddresses(iface).get(netifaces.AF_INET, [])
        for entry in addrs:
            ip = entry.get("addr")
            nm = entry.get("netmask")
            if ip and nm:
                return iface, ip, nm, str(ipaddress.IPv4Network(f"{ip}/{nm}", False))

    return None, None, None, None


def ping(ip, timeout=0.5):
    system = platform.system().lower()
    try:
        if system == "windows":
            cmd = ["ping", "-n", "1", "-w", str(int(timeout * 1000)), ip]
        else:
            cmd = ["ping", "-c", "1", "-W", str(int(timeout)), ip]

        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return res.returncode == 0
    except:
        return False


def ping_sweep(network_cidr):
    net = ipaddress.ip_network(network_cidr, False)
    hosts = [str(h) for h in net.hosts()]

    alive = []
    with ThreadPoolExecutor(max_workers=200) as exec:
        futures = {exec.submit(ping, ip): ip for ip in hosts}
        for fut in as_completed(futures):
            if fut.result():
                alive.append(futures[fut])

    alive.sort(key=lambda x: tuple(map(int, x.split("."))))
    return alive


def scan_cycle(network_cidr):
    alive_ips = ping_sweep(network_cidr)

    return [
        {
            "ip": ip,
            "mac": None,
            "vendor": None,
            "ping_only": True
        }
        for ip in alive_ips
    ]


def main():
    iface, ip, nm, network_cidr = detect_network()

    if not network_cidr:
        return

    while True:
        try:
            devices = scan_cycle(network_cidr)

            # ✅ MUST PRINT JSON
            print(json.dumps(devices), flush=True)

        except Exception as e:
            pass

        time.sleep(0.2)


if __name__ == "__main__":
    main()
