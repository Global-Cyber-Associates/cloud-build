# functions/ports.py
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Tuple

def _check_port(target: str, port: int, timeout: float) -> Tuple[int, bool]:
    """Return (port, is_open)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        res = s.connect_ex((target, port))
        return (port, res == 0)
    except Exception:
        return (port, False)
    finally:
        try:
            s.close()
        except Exception:
            pass

def _parse_port_range(port_range: str) -> Tuple[int, int]:
    """Parse 'start-end' range or single port '80'."""
    if "-" in port_range:
        start_str, end_str = port_range.split("-", 1)
        start, end = int(start_str), int(end_str)
    else:
        start = end = int(port_range)
    if start < 1: start = 1
    if end > 65535: end = 65535
    if end < start:
        start, end = end, start
    return start, end

def scan_ports(target: str = "127.0.0.1",
               port_range: str = "1-1024",
               timeout: float = 0.35,
               workers: int = 300) -> Dict[str, Any]:
    """
    Scan ports on target and return {"target": target, "open_ports": [...]}.
    - timeout: seconds per connection attempt
    - workers: number of threads to use
    """
    try:
        start, end = _parse_port_range(port_range)
        total = end - start + 1
        ports = range(start, end + 1)

        open_ports: List[int] = []

        # Limit workers sensibly
        max_workers = max(10, min(workers, 1000))

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(_check_port, target, p, timeout): p for p in ports}
            checked = 0
            for fut in as_completed(futures):
                port, is_open = fut.result()
                checked += 1
                if is_open:
                    open_ports.append(port)
        open_ports.sort()
        return {"target": target, "open_ports": open_ports, "scanned_range": f"{start}-{end}"}
    except Exception as e:
        return {"error": str(e)}
