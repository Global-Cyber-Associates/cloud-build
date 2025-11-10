import ctypes
from ctypes import wintypes
import wmi
import subprocess
import time
import logging
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

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

def open_volume(drive_letter):
    path = f"\\\\.\\{drive_letter}:"
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

def force_eject_drive(drive_letter):
    try:
        subprocess.run(
            ["powershell", "-Command",
             f"(Get-WmiObject Win32_Volume -Filter \"DriveLetter='{drive_letter}:'\").Eject()"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        logging.warning(f"[💥] Force ejection executed for {drive_letter}")
    except Exception as e:
        logging.error(f"[⚠️] Force eject failed for {drive_letter}: {e}")

def eject_usb_device(usb):
    drive_letter = usb["drive_letter"]
    try:
        handle = open_volume(drive_letter)
        dismount_and_eject(handle)
        logging.info(f"[✅] Ejected: {drive_letter}")
    except Exception as e:
        logging.warning(f"[⚠️] Normal eject failed for {drive_letter}: {e}")
        force_eject_drive(drive_letter)

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
                        "serial_number": getattr(disk, "SerialNumber", "unknown")
                    })
        except Exception:
            continue
    return drives

def monitor_usb(interval=3, timeout=5):
    logging.info("🔒 USB Monitor started.")
    known_devices = set()

    while True:
        try:
            connected_devices = list_usb_drives()
            current_ids = {usb["serial_number"] for usb in connected_devices}

            # Send all connected devices to backend for approval check
            if connected_devices:
                send_data("usb_devices", {"connected_devices": connected_devices})

            # Wait for backend response
            devices_status = {}
            start_time = time.time()
            while time.time() - start_time < timeout:
                if hasattr(sio, "latest_usb_status") and sio.latest_usb_status:
                    devices_status = sio.latest_usb_status
                    sio.latest_usb_status = None
                    break
                time.sleep(0.5)

            # Default: eject all if no response
            if not devices_status:
                logging.warning("[⚠️] No backend response, ejecting all new USBs")
                for usb in connected_devices:
                    eject_usb_device(usb)
            else:
                # Check all connected devices against backend status
                for usb in connected_devices:
                    serial = usb["serial_number"]
                    status = next((d["status"] for d in devices_status.get("devices", []) if d["serial_number"] == serial), "NotAllowed")
                    if status != "Allowed":
                        logging.info(f"[🚫] USB {usb['drive_letter']} blocked by admin → ejecting")
                        eject_usb_device(usb)
                    else:
                        logging.info(f"[✅] USB {usb['drive_letter']} approved by admin")

            # Track removed devices
            removed = known_devices - current_ids
            for pid in removed:
                logging.info(f"[❌] USB removed: {pid}")

            known_devices = current_ids
            time.sleep(interval)

        except Exception as e:
            logging.error(f"[⚠️] Error in USB monitor loop: {e}")
            time.sleep(interval)

if __name__ == "__main__":
    try:
        connect_socket()
        sio.latest_usb_status = None

        @sio.on("usb_validation")
        def handle_usb_validation(data):
            sio.latest_usb_status = data

        monitor_usb()
    except KeyboardInterrupt:
        logging.info("🛑 USB Monitor stopped by user.")
