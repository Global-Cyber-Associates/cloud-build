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
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

# ------------------------------------------------------------
# CACHE MANAGEMENT (WITH STATUS)
# ------------------------------------------------------------
# Cache format: { "SERIAL": "Allowed" | "Blocked" | "Pending" }
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
    usb_cache[serial] = status
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
    kernel32.DeviceIoControl(
        handle,
        IOCTL_DISMOUNT_VOLUME,
        None,
        0,
        None,
        0,
        ctypes.byref(bytes_returned),
        None
    )
    kernel32.DeviceIoControl(
        handle,
        IOCTL_STORAGE_EJECT_MEDIA,
        None,
        0,
        None,
        0,
        ctypes.byref(bytes_returned),
        None
    )
    kernel32.CloseHandle(handle)

def force_eject_drive(letter):
    try:
        subprocess.run(
            [
                "powershell",
                "-Command",
                f"(Get-WmiObject Win32_Volume -Filter \"DriveLetter='{letter}:'\").Eject()"
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
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
                    drives.append({
                        "drive_letter": logical.DeviceID[0],
                        "vendor_id": getattr(disk, "PNPDeviceID", ""),
                        "product_id": getattr(disk, "DeviceID", ""),
                        "description": getattr(disk, "Model", ""),
                        "serial_number": getattr(disk, "SerialNumber", "unknown"),
                    })
        except:
            continue

    return drives

# ------------------------------------------------------------
# MAIN MONITOR LOOP (FIXED)
# ------------------------------------------------------------
def monitor_usb(interval=3, timeout=6):
    logging.info("🔒 USB Monitor started")
    known = set()

    while True:
        try:
            devices = list_usb_drives()
            current_serials = {u["serial_number"] for u in devices}

            # STEP 1 — add new devices as PENDING FIRST
            for usb in devices:
                serial = usb["serial_number"]
                if serial not in usb_cache:
                    usb_cache[serial] = "Pending"
                    save_cache()
                    logging.info(f"[📝] New USB detected → PENDING: {serial}")

            # STEP 2 — send to backend
            if devices:
                send_data("usb_devices", {"connected_devices": devices})

            # STEP 3 — wait for backend response
            backend_data = {}
            start = time.time()

            while time.time() - start < timeout:
                if getattr(sio, "latest_usb_status", None):
                    backend_data = sio.latest_usb_status
                    sio.latest_usb_status = None
                    break
                time.sleep(0.3)

            backend_list = backend_data.get("devices", [])

            # STEP 4 — update cache from backend
            for dev in backend_list:
                serial = dev["serial_number"]
                set_status(serial, dev["status"])  # Allowed / Blocked

            # STEP 5 — NOW decide using cache
            for usb in devices:
                serial = usb["serial_number"]
                status = usb_cache.get(serial, "Pending")

                if status == "Allowed":
                    logging.info(f"[🟢] Allowed: {usb['drive_letter']}")

                elif status == "Blocked":
                    logging.info(f"[🔴] Blocked → ejecting {usb['drive_letter']}")
                    eject_usb_device(usb)

                else:
                    logging.info(f"[⏳] Pending → NOT ejecting yet: {usb['drive_letter']}")

            # STEP 6 — removed USBs
            removed = known - current_serials
            for s in removed:
                logging.info(f"[❌] USB removed: {s}")

            known = current_serials
            time.sleep(interval)

        except Exception as e:
            logging.error(f"Loop error: {e}")
            time.sleep(interval)

# ------------------------------------------------------------
# ENTRY POINT ✅ CRASH FIXED
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
