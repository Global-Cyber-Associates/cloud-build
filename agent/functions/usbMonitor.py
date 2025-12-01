import ctypes
from ctypes import wintypes
import wmi
import subprocess
import time
import logging
import json
import os
from .sender import send_data, connect_socket, sio

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# --- Constants for ejection ---
GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_READ = 0x00000001
FILE_SHARE_WRITE = 0x00000002
OPEN_EXISTING = 3
IOCTL_DISMOUNT_VOLUME = 0x00090020
IOCTL_STORAGE_EJECT_MEDIA = 0x2D4808

CACHE_FILE = "usb_cache.json"
EJECT_DELAY = 3
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

# ------------------------------------------------------------
# CACHE MANAGEMENT (with timestamp)
# ------------------------------------------------------------
usb_cache = {}

def load_cache():
    global usb_cache
    if not os.path.exists(CACHE_FILE):
        usb_cache = {}
        return
    try:
        with open(CACHE_FILE, "r") as f:
            data = f.read().strip()
            usb_cache = json.loads(data) if data else {}
    except:
        logging.error("[⚠️] Cache corrupted → resetting")
        usb_cache = {}
        save_cache()

def save_cache():
    with open(CACHE_FILE, "w") as f:
        json.dump(usb_cache, f, indent=2)

load_cache()

# ------------------------------------------------------------
# USB Approval Management
# ------------------------------------------------------------
def set_status(serial, status):
    usb_cache[serial] = {"status": status, "timestamp": time.time()}
    save_cache()
    logging.info(f"[💾] Status updated → {serial}: {status}")

# ------------------------------------------------------------
# Ejection Helpers
# ------------------------------------------------------------
def open_volume(letter):
    path = f"\\\\.\\{letter}:"
    handle = kernel32.CreateFileW(
        path,
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        None,
        OPEN_EXISTING,
        0,
        None,
    )
    if handle == -1:
        raise ctypes.WinError(ctypes.get_last_error())
    return handle

def dismount_and_eject(handle):
    bytes_returned = wintypes.DWORD()
    kernel32.DeviceIoControl(handle, IOCTL_DISMOUNT_VOLUME, None, 0, None, 0, ctypes.byref(bytes_returned), None)
    kernel32.DeviceIoControl(handle, IOCTL_STORAGE_EJECT_MEDIA, None, 0, None, 0, ctypes.byref(bytes_returned), None)
    kernel32.CloseHandle(handle)

def force_eject_drive(letter):
    try:
        subprocess.run(
            ["powershell", "-Command",
             f"(Get-WmiObject Win32_Volume -Filter \"DriveLetter='{letter}:'\").Eject()"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        logging.warning(f"[💥] Forced eject {letter}")
    except Exception as e:
        logging.error(f"[⚠️] Force eject failed for {letter}: {e}")

def eject_usb_device(usb):
    letter = usb["drive_letter"]
    try:
        handle = open_volume(letter)
        dismount_and_eject(handle)
        logging.info(f"[🟢] Ejected drive {letter}")
    except:
        force_eject_drive(letter)

# ------------------------------------------------------------
# USB Scanner
# ------------------------------------------------------------
def list_usb_drives():
    c = wmi.WMI()
    drives = []

    for disk in c.Win32_DiskDrive(InterfaceType="USB"):
        try:
            for part in disk.associators("Win32_DiskDriveToDiskPartition"):
                for logical in part.associators("Win32_LogicalDiskToPartition"):
                    serial = getattr(disk, "SerialNumber", "unknown").strip()
                    drives.append({
                        "drive_letter": logical.DeviceID[0],
                        "vendor_id": getattr(disk, "PNPDeviceID", ""),
                        "product_id": getattr(disk, "DeviceID", ""),
                        "description": getattr(disk, "Model", ""),
                        "serial_number": serial if serial else "unknown",
                    })
        except:
            continue
    return drives

# ------------------------------------------------------------
# Normalize backend data
# ------------------------------------------------------------
def normalize_backend(devices):
    safe = []
    if not devices or not isinstance(devices, list):
        return safe
    for item in devices:
        if not isinstance(item, dict):
            continue
        safe.append({
            "serial_number": item.get("serial_number", "unknown"),
            "status": item.get("status", "Blocked")
        })
    return safe

# ------------------------------------------------------------
# MAIN MONITOR LOOP
# ------------------------------------------------------------
def monitor_usb(interval=3, timeout=6):
    logging.info("🔒 USB Monitor started")
    known = set()

    while True:
        try:
            devices = list_usb_drives()
            serials_now = {d["serial_number"] for d in devices}

            for usb in devices:
                serial = usb["serial_number"]
                if serial not in usb_cache:
                    usb_cache[serial] = {"status": "Pending", "timestamp": time.time()}
                    save_cache()
                    logging.info(f"[📝] New USB detected → PENDING: {serial}")

            if devices:
                send_data("usb_devices", {"connected_devices": devices})

            backend = None
            start = time.time()
            while time.time() - start < timeout:
                if getattr(sio, "latest_usb_status", None):
                    backend = sio.latest_usb_status
                    sio.latest_usb_status = None
                    break
                time.sleep(0.3)

            backend_devices = normalize_backend(
                backend.get("devices", []) if isinstance(backend, dict) else []
            )

            for dev in backend_devices:
                serial, status = dev["serial_number"], dev["status"]
                set_status(serial, status)

            for usb in devices:
                serial = usb["serial_number"]
                info = usb_cache.get(serial, {"status": "Pending"})
                status = info["status"]

                if status == "Allowed":
                    logging.info(f"[🟢] Allowed: {usb['drive_letter']}")
                elif status == "Blocked":
                    logging.info(f"[🔴] Blocked → ejecting {usb['drive_letter']}")
                    eject_usb_device(usb)
                else:
                    logging.info(f"[⏳] Pending → NOT ejecting yet: {usb['drive_letter']}")

            removed = known - serials_now
            for s in removed:
                logging.info(f"[❌] USB removed: {s}")
            known = serials_now

            time.sleep(interval)

        except Exception as e:
            logging.error(f"Loop error: {e}")
            time.sleep(interval)

# ------------------------------------------------------------
# ENTRY POINT ✅ FIXED
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        connect_socket()
        sio.latest_usb_status = None

        @sio.on("usb_validation")
        def handle_usb_validation(data):
            sio.latest_usb_status = data

        monitor_usb()

    except KeyboardInterrupt:
        logging.info("🛑 Stopped")
