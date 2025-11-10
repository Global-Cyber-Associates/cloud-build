import wmi
import pythoncom
import threading
import time
from datetime import datetime

def print_log(event_type, username=None):
    timestamp = datetime.now().isoformat()
    print(f"📌 [{timestamp}] Event: {event_type}, User: {username}")

def watch_user_events():
    pythoncom.CoInitialize()  # required for threads
    c = wmi.WMI()
    seen_records = set()  # track events we already processed

    while True:
        try:
            for event in c.Win32_NTLogEvent(Logfile='Security', EventCode=['4624','4634','4800','4801']):
                if event.RecordNumber not in seen_records:
                    seen_records.add(event.RecordNumber)
                    username = event.InsertionStrings[5] if event.InsertionStrings else None
                    if event.EventCode == "4624":
                        print_log("login", username)
                    elif event.EventCode == "4634":
                        print_log("logout", username)
                    elif event.EventCode == "4800":
                        print_log("lock", username)
                    elif event.EventCode == "4801":
                        print_log("unlock", username)
            time.sleep(5)  # poll every 5 seconds
        except wmi.x_wmi as e:
            print(f"[❌] WMI error: {e}")
            time.sleep(5)
        except Exception as e:
            print(f"[❌] Unexpected error: {e}")
            time.sleep(5)

def start_logs_thread():
    t = threading.Thread(target=watch_user_events, daemon=True)
    t.start()
    print("🟢 User event log watcher started")

if __name__ == "__main__":
    start_logs_thread()
    while True:
        time.sleep(1)
