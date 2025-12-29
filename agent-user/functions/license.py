import os
import logging
import winreg
import hashlib
import subprocess
import json

def get_machine_guid():
    try:
        registry = winreg.ConnectRegistry(None, winreg.HKEY_LOCAL_MACHINE)
        key = winreg.OpenKey(registry, r"SOFTWARE\Microsoft\Cryptography")
        value, regtype = winreg.QueryValueEx(key, "MachineGuid")
        winreg.CloseKey(key)
        return value
    except Exception:
        return "UnknownGuid"

def get_cpu_id():
    try:
        output = subprocess.check_output("wmic cpu get processorid", shell=True).decode().strip()
        lines = [line.strip() for line in output.split('\n') if line.strip()]
        if len(lines) > 1:
            return lines[1]
        return "UnknownCPU"
    except Exception as e:
        logging.error(f"Error getting CPU ID: {e}")
        return "UnknownCPU"
    except Exception:
        return "UnknownCPU"

def get_system_drive_serial():
    try:
        output = subprocess.check_output("wmic diskdrive get serialnumber", shell=True).decode().strip()
        lines = [line.strip() for line in output.split('\n') if line.strip()]
        if len(lines) > 1:
            return lines[1]
        return "UnknownDrive"
    except Exception as e:
        logging.error(f"Error getting Drive Serial: {e}")
        return "UnknownDrive"
    except Exception:
        return "UnknownDrive"

def generate_fingerprint():
    machine_guid = get_machine_guid()
    cpu_id = get_cpu_id()
    drive_serial = get_system_drive_serial()
    salt = "GCA_VISUS_NT_2025"
    raw_id = f"{machine_guid}|{cpu_id}|{drive_serial}|{salt}"
    return hashlib.sha256(raw_id.encode()).hexdigest()

TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "license.token")

def save_license_token(token):
    with open(TOKEN_FILE, "w") as f:
        f.write(token)

def load_license_token():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "r") as f:
            return f.read().strip()
    return None

def verify_license_locally(token, fingerprint):
    if not token:
        return False, "No token found"
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return False, "Invalid token format"
        import base64
        payload_b64 = parts[1]
        payload_b64 += '=' * (-len(payload_b64) % 4)
        payload_json = base64.b64decode(payload_b64).decode()
        payload = json.loads(payload_json)
        if payload.get("fingerprint") != fingerprint:
            return False, "Hardware ID mismatch"
        import time
        if payload.get("exp") and payload.get("exp") < time.time():
            return False, "License expired"
        return True, "Valid"
    except Exception as e:
        return False, f"Verification failed: {str(e)}"
