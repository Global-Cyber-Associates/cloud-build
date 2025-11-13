#!/usr/bin/env python3
"""
scan_to_json.py

Wrapper around network_scanner_safe.py that prints exactly one JSON object to stdout.
All scanner debug/human prints are captured and sent to stderr (so stdout remains pure JSON).

Usage:
  python scan_to_json.py --auto --json
  python scan_to_json.py --network 192.168.1.0/24 --json
  python scan_to_json.py --no-arp --json
"""

import argparse
import json
import os
import sys
import traceback
import io
import contextlib

# Ensure this script can import network_scanner_safe when run from anywhere.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

try:
    from network_scanner_cli import (
        auto_select_iface_and_network,
        arp_scan,
        ping_sweep,
        merge_and_dedupe,
        safe_vendor_lookup,
    )
except Exception as e:
    # Can't import scanner module — print JSON error to stdout (so callers can parse)
    err = {"ok": False, "results": {"error": "Could not import network_scanner_safe", "detail": str(e)}}
    print(json.dumps(err))
    sys.exit(2)


def build_results(mac_map):
    """Turn the OrderedDict/mac_map into a JSON-serializable list of device objects."""
    devices = []
    for entry in mac_map.values():
        mac = entry.get("mac")
        ips = sorted(list(entry.get("ips", [])))
        if mac:
            vendor = safe_vendor_lookup(mac)
            mobile = any(k in vendor.lower() for k in [
                "apple", "samsung", "xiaomi", "huawei", "oneplus", "pixel", "realme", "vivo"
            ])
            devices.append({
                "ips": ips,
                "mac": mac,
                "vendor": vendor,
                "mobile": bool(mobile)
            })
        else:
            devices.append({
                "ips": ips,
                "mac": None,
                "vendor": "Unknown (ping-only)",
                "mobile": False
            })
    return devices


def run_scan(network_cidr=None, no_arp=False):
    """
    Run the scanner functions but capture their stdout so only JSON is printed to stdout.
    Return (True, payload) on success, (False, error_obj) on failure.
    """
    try:
        # Auto-detect network & iface if not provided
        iface = None
        ip = None
        netmask = None
        if not network_cidr:
            iface, ip, netmask, network_cidr = auto_select_iface_and_network()

        if not network_cidr:
            return False, {"error": "Could not detect network. Provide --network or use --auto on a machine with an active interface."}

        # Print the chosen interface to stderr (so it appears in logs but not in stdout JSON)
        print(f"[*] Using interface {iface} for ARP scan", file=sys.stderr)

        # Capture any prints from arp_scan / ping_sweep (they print human-friendly logs).
        arp_map = {}
        ping_list = []

        # Use a StringIO buffer and redirect stdout while calling scanner functions.
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            if not no_arp:
                try:
                    # Pass the detected iface to arp_scan to help Scapy bind on Windows.
                    arp_map = arp_scan(network_cidr, iface=iface, timeout=2)
                except Exception as e:
                    # Keep arp_map empty and continue; capture exception into stderr after redirect
                    pass

            try:
                ping_list = ping_sweep(network_cidr)
            except Exception:
                ping_list = []

        # Any captured text from scanner functions is in buf.getvalue(); send it to stderr for diagnostics
        captured = buf.getvalue()
        if captured:
            # print captured debugging lines to stderr so backend logs can show them
            for line in captured.splitlines():
                print(line, file=sys.stderr)

        # Merge results and convert to JSON-serializable structures
        mac_map = merge_and_dedupe(arp_map, ping_list)
        devices = build_results(mac_map)

        return True, {"network": network_cidr, "devices": devices}

    except Exception as e:
        tb = traceback.format_exc()
        return False, {"error": "Unhandled exception during scan", "detail": str(e), "traceback": tb}


def main():
    ap = argparse.ArgumentParser(description="Wrapper: scanner -> JSON")
    ap.add_argument("--auto", action="store_true", help="auto-detect interface/network")
    ap.add_argument("--network", type=str, help="explicit network CIDR (e.g. 192.168.1.0/24)")
    ap.add_argument("--no-arp", action="store_true", help="skip ARP (ping-only)")
    # --json exists for CLI familiarity; output is JSON-only by design
    ap.add_argument("--json", action="store_true", help="print JSON only (default behavior)")
    args = ap.parse_args()

    # Determine network_cidr: explicit overrides auto
    network_cidr = args.network if args.network else None
    if args.auto and not network_cidr:
        network_cidr = None  # run_scan will auto-detect

    success, payload = run_scan(network_cidr=network_cidr, no_arp=args.no_arp)

    if success:
        out = {"ok": True, "results": payload}
        # stdout contains ONLY JSON
        print(json.dumps(out))
        sys.exit(0)
    else:
        out = {"ok": False, "results": payload}
        print(json.dumps(out))
        sys.exit(1)


if __name__ == "__main__":
    main()
