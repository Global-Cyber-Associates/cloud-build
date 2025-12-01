#!/usr/bin/env python3
import subprocess
import json
import os
import sys
from collections import deque

# More stable, less flicker:
STABILITY_COUNT = 3

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    scanner_path = os.path.join(base_dir, "scanner_service.py")

    if not os.path.exists(scanner_path):
        print("❌ scanner_service.py NOT FOUND:", scanner_path, flush=True)
        return

    process = subprocess.Popen(
        [sys.executable, scanner_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )

    recent = deque(maxlen=STABILITY_COUNT)
    last_stable = None

    for line in process.stdout:
        line = line.strip()
        if not line:
            continue

        try:
            devices = json.loads(line)
        except:
            continue

        current = frozenset([dev["ip"] for dev in devices])
        recent.append(current)

        if len(recent) == STABILITY_COUNT and all(s == recent[0] for s in recent):
            if last_stable != current:
                print(json.dumps(devices), flush=True)
                last_stable = current

    process.terminate()

if __name__ == "__main__":
    main()
