import ipaddress
import subprocess
import platform
from concurrent.futures import ThreadPoolExecutor, as_completed
import netifaces
from functions.ports import scan_ports

def get_local_network():
    """Detect the local subnet (e.g. 192.168.1.0/24) automatically."""
    for interface in netifaces.interfaces():
        addrs = netifaces.ifaddresses(interface)
        if netifaces.AF_INET in addrs:
            ipv4_info = addrs[netifaces.AF_INET][0]
            ip = ipv4_info['addr']
            netmask = ipv4_info['netmask']

            # Skip loopback or invalid addresses
            if ip.startswith("127.") or ip.startswith("169.254"):
                continue

            # Convert IP + netmask → CIDR (e.g. 192.168.1.0/24)
            network = ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False)
            return str(network)
    return None

def ping_host(ip):
    """Ping a single IP to check if it is alive."""
    try:
        param = "-n" if platform.system().lower() == "windows" else "-c"
        result = subprocess.run(
            ["ping", param, "1", str(ip)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        return result.returncode == 0
    except Exception:
        return False

def scan_network(network_cidr=None, port_range="1-1024"):
    """
    Scans the entire network for active devices and their open ports.
    If network_cidr is not provided, it will be auto-detected.
    """
    if not network_cidr:
        network_cidr = get_local_network()
        if not network_cidr:
            print("[!] Could not detect local network automatically.")
            return []
        print(f"[*] Detected local network: {network_cidr}")

    network = ipaddress.ip_network(network_cidr, strict=False)
    active_hosts = []

    print(f"[*] Scanning network {network_cidr} ...")

    with ThreadPoolExecutor(max_workers=50) as executor:
        futures = {executor.submit(ping_host, ip): ip for ip in network.hosts()}
        for future in as_completed(futures):
            ip = futures[future]
            if future.result():
                print(f"[+] Host {ip} is alive")
                active_hosts.append(str(ip))

    network_results = []
    for ip in active_hosts:
        if port_range:
            print(f"[*] Scanning ports on {ip}")
            ports = scan_ports(ip, port_range)
        else:
            print(f"[*] Skipping port scan for {ip} (ping-only)")
            ports = []
        network_results.append({
            "ip": ip,
            "ports": ports
        })

    return network_results
