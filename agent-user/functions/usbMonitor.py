import ctypes
from ctypes import wintypes
import wmi
import subprocess
import time
import logging
import json
import os
import sys
from .sender import send_data, connect_socket, sio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# --- Constants for ejection ---
GENERIC_READ                = 0x80000000
GENERIC_WRITE               = 0x40000000
FILE_SHARE_READ             = 0x00000001
FILE_SHARE_WRITE            = 0x00000002
OPEN_EXISTING               = 3
IOCTL_DISMOUNT_VOLUME       = 0x00090020
IOCTL_STORAGE_EJECT_MEDIA   = 0x2D4808

<<<<<<< HEAD
# Cache and paths
def _data_dir():
=======
# --- FIX: Ensure __file__ exists for datadir() ---
file = __file__

# --- FIX: Corrected datadir() implementation ---
def datadir():
>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

# --- FIX: Add missing _data_dir() used by CACHE_FILE ---
def _data_dir():
    return datadir()

# Cache file path
CACHE_FILE = os.path.join(_data_dir(), "usb_cache.json")
<<<<<<< HEAD
BACKEND_PENDING_TIMEOUT = 10  # seconds
=======

BACKEND_PENDING_TIMEOUT = 10
>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
EJECT_DELAY = 3

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

usb_cache = {}

def load_cache():
    global usb_cache
    try:
        if not os.path.exists(CACHE_FILE):
            usb_cache = {}
            return
<<<<<<< HEAD
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            usb_cache = json.loads(f.read() or "{}")
=======

        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            usb_cache = json.loads(f.read() or "{}")

>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
    except:
        usb_cache = {}
        save_cache()

def save_cache():
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(usb_cache, f, indent=2)
    except:
        pass

load_cache()

def set_status(serial, status):
    usb_cache[serial] = {
        "status": status,
        "timestamp": time.time()
    }
    save_cache()
    logging.info(f"[💾] Status updated → {serial}: {status}")

# Ejection helpers
def open_volume(letter):
    try:
<<<<<<< HEAD
        return kernel32.CreateFileW(f"\\\\.\\{letter}:", GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, None, OPEN_EXISTING, 0, None)
=======
        return kernel32.CreateFileW(
            f"\\\\.\\{letter}:",
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            0,
            None
        )
>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
    except:
        return -1

def dismount_and_eject(handle):
    try:
        br = wintypes.DWORD()
<<<<<<< HEAD
        kernel32.DeviceIoControl(handle, IOCTL_DISMOUNT_VOLUME, None, 0, None, 0, ctypes.byref(br), None)
        kernel32.DeviceIoControl(handle, IOCTL_STORAGE_EJECT_MEDIA, None, 0, None, 0, ctypes.byref(br), None)
    except:
        pass
=======
        kernel32.DeviceIoControl(
            handle,
            IOCTL_DISMOUNT_VOLUME,
            None,
            0,
            None,
            0,
            ctypes.byref(br),
            None
        )
        kernel32.DeviceIoControl(
            handle,
            IOCTL_STORAGE_EJECT_MEDIA,
            None,
            0,
            None,
            0,
            ctypes.byref(br),
            None
        )
    except:
        pass

>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
    try:
        kernel32.CloseHandle(handle)
    except:
        pass

def force_eject_drive(letter):
    try:
<<<<<<< HEAD
        subprocess.run(["powershell", "-Command", f"(Get-WmiObject Win32_Volume -Filter \"DriveLetter='{letter}:'\").Eject()"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
=======
        subprocess.run(
            [
                "powershell",
                "-Command",
                f"(Get-WmiObject Win32_Volume -Filter \"DriveLetter='{letter}:'\").Eject()"
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
    except:
        pass

def eject_usb_device(usb):
    letter = usb.get("drive_letter")

    if not letter:
        return

    try:
        handle = open_volume(letter)
<<<<<<< HEAD
        if handle == -1:
            force_eject_drive(letter)
            return
        dismount_and_eject(handle)
=======

        if handle == -1:
            force_eject_drive(letter)
            return

        dismount_and_eject(handle)

>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
    except:
        force_eject_drive(letter)

# USB scanning
def list_usb_drives():
    out = []
<<<<<<< HEAD
=======

>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
    try:
        c = wmi.WMI()

        for disk in c.Win32_DiskDrive(InterfaceType="USB"):
            try:
                for part in disk.associators("Win32_DiskDriveToDiskPartition"):
                    for logical in part.associators("Win32_LogicalDiskToPartition"):
                        serial = getattr(disk, "SerialNumber", "unknown") or "unknown"
<<<<<<< HEAD
=======

>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
                        out.append({
                            "drive_letter": logical.DeviceID[0] if logical.DeviceID else "",
                            "vendor_id": getattr(disk, "PNPDeviceID", ""),
                            "product_id": getattr(disk, "DeviceID", ""),
                            "description": getattr(disk, "Model", ""),
                            "serial_number": str(serial).strip(),
                        })
            except:
                continue
    except:
        pass
<<<<<<< HEAD
    return out

# Backend normalization
def normalize_backend(devices):
    safe = []
    for item in devices or []:
        if not isinstance(item, dict):
            continue
        safe.append({"serial_number": item.get("serial_number", "unknown"), "status": item.get("status", "Blocked")})
=======

    return out

# Backend normalization
def normalize_backend(devices):
    safe = []

    for item in devices or []:
        if not isinstance(item, dict):
            continue

        safe.append({
            "serial_number": item.get("serial_number", "unknown"),
            "status": item.get("status", "Blocked")
        })

>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
    return safe

# Decision logic
def handle_backend_decision(status, serial):
    info = usb_cache.get(serial, {})
    timestamp = info.get("timestamp", time.time())

    if status == "Allowed":
        return "ALLOW"
<<<<<<< HEAD
    elif status == "Pending":
        # if pending > 10 sec, mark offline and eject
        if time.time() - timestamp > BACKEND_PENDING_TIMEOUT:
            set_status(serial, "Offline")
            return "EJECT"
        return "WAIT"
    else:
        # Blocked, WaitingForApproval, Offline or unknown → eject
=======

    elif status == "Pending":
        if time.time() - timestamp > BACKEND_PENDING_TIMEOUT:
            set_status(serial, "Offline")
            return "EJECT"

        return "WAIT"

    else:
>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
        return "EJECT"

# Main monitor loop
def monitor_usb(interval=3, timeout=6):
    known = set()
    logging.info("🔒 USB Monitor started")

    while True:
        try:
            devices = list_usb_drives()
            serials_now = {d.get("serial_number", "unknown") for d in devices}

            for usb in devices:
                serial = usb.get("serial_number", "unknown")

                if serial not in usb_cache:
                    set_status(serial, "Pending")

            if devices:
                try:
                    send_data("usb_devices", {"connected_devices": devices})
                except:
                    pass

            # Wait for backend response
            backend = None
            start = time.time()

            while time.time() - start < timeout:
                try:
                    if getattr(sio, "latest_usb_status", None):
                        backend = sio.latest_usb_status
                        sio.latest_usb_status = None
                        break
                except:
                    pass

                time.sleep(0.3)

<<<<<<< HEAD
            backend_devs = normalize_backend(backend.get("devices", []) if isinstance(backend, dict) else [])

            for dev in backend_devs:
                serial, status = dev.get("serial_number", "unknown"), dev.get("status", "Blocked")
=======
            backend_devs = normalize_backend(
                backend.get("devices", [])
                if isinstance(backend, dict)
                else []
            )

            for dev in backend_devs:
                serial  = dev.get("serial_number", "unknown")
                status  = dev.get("status", "Blocked")
>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
                set_status(serial, status)

            # Apply decision
            for usb in devices:
                serial = usb.get("serial_number", "unknown")
                status = usb_cache.get(serial, {}).get("status", "Pending")
                decision = handle_backend_decision(status, serial)

                if decision == "ALLOW":
                    logging.info(f"[🟢] Allowed: {usb.get('drive_letter')}")
<<<<<<< HEAD
                elif decision == "WAIT":
                    logging.info(f"[⏳] Pending: {usb.get('drive_letter')} (waiting for backend)")
=======

                elif decision == "WAIT":
                    logging.info(
                        f"[⏳] Pending: {usb.get('drive_letter')} (waiting for backend)"
                    )

>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
                else:
                    logging.info(f"[🔴] Ejecting: {usb.get('drive_letter')}")
                    eject_usb_device(usb)

            # Removed devices
            removed = known - serials_now

            for s in removed:
                logging.info(f"[❌] USB removed: {s}")

            known = serials_now
            time.sleep(interval)

        except Exception as e:
            logging.error(f"Loop error: {e}")
            time.sleep(max(1, interval))

<<<<<<< HEAD
# Entry point
=======
# --- FIX: Correct entry point ---
>>>>>>> e483380424be5c8923f6fdad55390a24580f7088
if __name__ == "__main__":
    try:
        try:
            connect_socket()
        except:
            pass

        try:
            sio.latest_usb_status = None
        except:
            pass

        @sio.on("usb_validation")
        def handle_usb_validation(data):
            try:
                sio.latest_usb_status = data
            except:
                pass

        monitor_usb()

    except KeyboardInterrupt:
        logging.info("🛑 Stopped")

    except Exception as e:
        logging.error(f"[⚠️] usbMonitor crashed at entry: {e}")
 