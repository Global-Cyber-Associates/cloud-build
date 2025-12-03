import ctypes 
from ctypes import wintypes 
import wmi 
import subprocess 
import time 
import logging 
import json 
import os 
import sys 
 
from cryptography.fernet import Fernet 
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
 
# Place cache next to the executable/script so EXE has a writable location. 
def _data_dir(): 
    if getattr(sys, "frozen", False): 
        # When frozen, put cache next to exe (same folder where you will place .env etc.) 
        return os.path.dirname(sys.executable) 
    return os.path.dirname(os.path.abspath(__file__)) 
 
# Encrypted cache filenames (next to script/exe) 
CACHE_FILE = os.path.join(_data_dir(), "usb_cache.enc") 
KEY_FILE = os.path.join(_data_dir(), "cache.key") 
 
# Behavior 
PENDING_EJECT_SECONDS = 10  # pending age threshold to eject 
EJECT_DELAY = 3 
 
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True) 
 
# ------------------------------------------------------------ 
# ENCRYPTED CACHE MANAGEMENT (Fernet) 
# ------------------------------------------------------------ 
usb_cache = {} 
 
def load_key(): 
    """ 
    Loads (or creates) a key file next to the script. 
    Returns a Fernet instance. 
    """ 
    try: 
        if not os.path.exists(KEY_FILE): 
            key = Fernet.generate_key() 
            with open(KEY_FILE, "wb") as f: 
                f.write(key) 
            logging.warning(f"[🔐] New cache key generated and saved to: {KEY_FILE}") 
            logging.warning("[🔐] Keep this file safe; without it the cache cannot be decrypted.") 
        else: 
            with open(KEY_FILE, "rb") as f: 
                key = f.read() 
 
        return Fernet(key) 
    except Exception as e: 
        logging.error(f"[⚠️] Failed to load/create cache key: {e}") 
        raise 
 
try: 
    fernet = load_key() 
except Exception: 
    # If key cannot be loaded, fall back to an in-memory Fernet (not ideal) or exit: 
    logging.error("[❌] Critical: cannot load cache key. Exiting.") 
    raise SystemExit(1) 
 
def load_cache(): 
    global usb_cache 
    if not os.path.exists(CACHE_FILE): 
        usb_cache = {} 
        return 
    try: 
        with open(CACHE_FILE, "rb") as f: 
            encrypted = f.read() 
        decrypted = fernet.decrypt(encrypted) 
        usb_cache = json.loads(decrypted.decode("utf-8")) if decrypted else {} 
    except Exception as e: 
        logging.error(f"[⚠️] Encrypted cache corrupted or unreadable → resetting ({e})") 
        usb_cache = {} 
        try: 
            save_cache() 
        except Exception as se: 
            logging.error(f"[⚠️] Failed writing fresh cache: {se}") 
 
def save_cache(): 
    try: 
        serialized = json.dumps(usb_cache).encode("utf-8") 
        encrypted = fernet.encrypt(serialized) 
        with open(CACHE_FILE, "wb") as f: 
            f.write(encrypted) 
    except Exception as e: 
        logging.error(f"[⚠️] Failed to save encrypted cache {CACHE_FILE}: {e}") 
 
# Initialize cache 
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
    # CreateFileW may return INVALID_HANDLE_VALUE (-1) on failure 
    if handle == -1 or not handle: 
        raise ctypes.WinError(ctypes.get_last_error()) 
    return handle 
 
def dismount_and_eject(handle): 
    bytes_returned = wintypes.DWORD() 
    try: 
        kernel32.DeviceIoControl(handle, IOCTL_DISMOUNT_VOLUME, None, 0, None, 0, ctypes.byref(bytes_returned), None) 
    except Exception as e: 
        logging.debug(f"[⚠️] Dismount failed: {e}") 
    try: 
        kernel32.DeviceIoControl(handle, IOCTL_STORAGE_EJECT_MEDIA, None, 0, None, 0, ctypes.byref(bytes_returned), None) 
    except Exception as e: 
        logging.debug(f"[⚠️] Eject ioctl failed: {e}") 
    try: 
        kernel32.CloseHandle(handle) 
    except Exception: 
        pass 
 
def force_eject_drive(letter): 
    try: 
        subprocess.run( 
            ["powershell", "-NoProfile", "-Command", 
             f"(Get-WmiObject Win32_Volume -Filter \"DriveLetter='{letter}:'\").Eject()"], 
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False 
        ) 
        logging.warning(f"[💥] Forced eject {letter}") 
    except Exception as e: 
        logging.error(f"[⚠️] Force eject failed for {letter}: {e}") 
 
def eject_usb_device(usb): 
    letter = usb.get("drive_letter") 
    if not letter: 
        logging.error(f"[⚠️] No drive letter for usb entry: {usb}") 
        return 
    try: 
        handle = open_volume(letter) 
        dismount_and_eject(handle) 
        logging.info(f"[🟢] Ejected drive {letter}") 
    except Exception as e: 
        logging.debug(f"[⚠️] Open/dismount failed for {letter}: {e}") 
        force_eject_drive(letter) 
 
# ------------------------------------------------------------ 
# USB Scanner 
# ------------------------------------------------------------ 
def list_usb_drives(): 
    drives = [] 
    try: 
        c = wmi.WMI() 
        for disk in c.Win32_DiskDrive(InterfaceType="USB"): 
            try: 
                for part in disk.associators("Win32_DiskDriveToDiskPartition"): 
                    for logical in part.associators("Win32_LogicalDiskToPartition"): 
                        serial = getattr(disk, "SerialNumber", "unknown") 
                        if serial is None: 
                            serial = "unknown" 
                        serial = str(serial).strip() if isinstance(serial, str) else "unknown" 
                        drives.append({ 
                            "drive_letter": logical.DeviceID[0] if logical.DeviceID else "", 
                            "vendor_id": getattr(disk, "PNPDeviceID", ""), 
                            "product_id": getattr(disk, "DeviceID", ""), 
                            "description": getattr(disk, "Model", ""), 
                            "serial_number": serial if serial else "unknown", 
                        }) 
            except Exception: 
                # continue scanning remaining disks; don't let a single disk break the scan 
                logging.debug("Failed enumerating partitions for disk, continuing.") 
                continue 
    except Exception as e: 
        logging.error(f"[⚠️] list_usb_drives() failed: {e}") 
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
            serials_now = {d.get("serial_number", "unknown") for d in devices} 
 
            for usb in devices: 
                serial = usb.get("serial_number", "unknown") 
                if serial not in usb_cache: 
                    usb_cache[serial] = {"status": "Pending", "timestamp": time.time()} 
                    save_cache() 
                    logging.info(f"[📝] New USB detected → PENDING: {serial}") 
 
            if devices: 
                try: 
                    send_data("usb_devices", {"connected_devices": devices}) 
                except Exception as e: 
                    logging.error(f"[⚠️] send_data failed: {e}") 
 
            backend = None 
            start = time.time() 
            while time.time() - start < timeout: 
                try: 
                    if getattr(sio, "latest_usb_status", None): 
                        backend = sio.latest_usb_status 
                        sio.latest_usb_status = None 
                        break 
                except Exception: 
                    # Accessing sio might fail if socket isn't ready; ignore and retry 
                    pass 
                time.sleep(0.3) 
 
            backend_devices = normalize_backend( 
                backend.get("devices", []) if isinstance(backend, dict) else [] 
            ) 
 
            for dev in backend_devices: 
                serial, status = dev.get("serial_number", "unknown"), dev.get("status", "Blocked") 
                try: 
                    set_status(serial, status) 
                except Exception as e: 
                    logging.error(f"[⚠️] set_status failed for {serial}: {e}") 
 
            now = time.time() 
            for usb in devices: 
                serial = usb.get("serial_number", "unknown") 
                info = usb_cache.get(serial, {"status": "Pending", "timestamp": now}) 
                status = info.get("status", "Pending") 
 
                # If cache explicitly says Waiting for Approval -> eject immediately 
                if status == "Waiting for Approval": 
                    logging.info(f"[🟠] Waiting for Approval → ejecting {usb.get('drive_letter')}") 
                    try: 
                        set_status(serial, "Blocked") 
                    except Exception as e: 
                        logging.error(f"[⚠️] Failed to set status to Blocked for {serial}: {e}") 
                    try: 
                        eject_usb_device(usb) 
                    except Exception as e: 
                        logging.error(f"[⚠️] eject failed: {e}") 
                    continue 
 
                # Blocked -> eject immediately 
                if status == "Blocked": 
                    logging.info(f"[🔴] Blocked → ejecting {usb.get('drive_letter')}") 
                    try: 
                        eject_usb_device(usb) 
                    except Exception as e: 
                        logging.error(f"[⚠️] eject failed: {e}") 
                    continue 
 
                # Allowed -> do nothing 
                if status == "Allowed": 
                    logging.info(f"[🟢] Allowed: {usb.get('drive_letter')}") 
                    continue 
 
                # Pending -> check age; eject if older than threshold 
                if status == "Pending": 
                    age = now - info.get("timestamp", now) 
                    if age >= PENDING_EJECT_SECONDS: 
                        logging.info(f"[⏳→🔴] Pending > {PENDING_EJECT_SECONDS}s ({int(age)}s) → ejecting {usb.get('drive_letter')}") 
                        try: 
                            set_status(serial, "Blocked") 
                        except Exception as e: 
                            logging.error(f"[⚠️] Failed to set status to Blocked for {serial}: {e}") 
                        try: 
                            eject_usb_device(usb) 
                        except Exception as e: 
                            logging.error(f"[⚠️] eject failed: {e}") 
                    else: 
                        logging.info(f"[⏳] Pending ({int(age)}s) → NOT ejecting yet: {usb.get('drive_letter')}") 
                    continue 
 
                # Unknown statuses default: do not eject but log 
                logging.info(f"[❔] Unknown status '{status}' for {serial} → not ejecting by default") 
 
            removed = known - serials_now 
            for s in removed: 
                logging.info(f"[❌] USB removed: {s}") 
            known = serials_now 
 
            time.sleep(interval) 
 
        except Exception as e: 
            logging.error(f"Loop error: {e}") 
            # small backoff to avoid tight crash loops 
            time.sleep(max(1, interval)) 
 
# ------------------------------------------------------------ 
# ENTRY POINT (kept behavior; guarded connect_socket) 
# ------------------------------------------------------------ 
if __name__ == "__main__": 
    try: 
        # connect_socket can fail in frozen environment; guard it so USB monitor won't crash the process 
        try: 
            connect_socket() 
        except Exception as e: 
            logging.error(f"[⚠️] connect_socket() failed in usbMonitor entry: {e}") 
        try: 
            sio.latest_usb_status = None 
        except Exception: 
            pass 
 
        @sio.on("usb_validation") 
        def handle_usb_validation(data): 
            try: 
                sio.latest_usb_status = data 
            except Exception: 
                pass 
 
        monitor_usb() 
 
    except KeyboardInterrupt: 
        logging.info("🛑 Stopped") 
    except Exception as e: 
        logging.error(f"[⚠️] usbMonitor crashed at entry: {e}") 
