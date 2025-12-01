# functions/installed_apps.py
import logging
from typing import List, Dict

# Windows-only parts guarded so module imports on Linux/macOS won't crash
try:
    import winreg
except Exception:
    winreg = None

logging.basicConfig(level=logging.INFO)
_MAX_SEND = 200  # left for caller to handle if desired

_UNINSTALL_KEYS = (
    r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
)

_HIVE_NAMES = {
    getattr(winreg, "HKEY_LOCAL_MACHINE", "HKEY_LOCAL_MACHINE"): "HKEY_LOCAL_MACHINE",
    getattr(winreg, "HKEY_CURRENT_USER", "HKEY_CURRENT_USER"): "HKEY_CURRENT_USER"
} if winreg else {}


def _read_registry_uninstall() -> List[Dict]:
    """Return raw list of uninstall entries from Windows registry."""
    apps: List[Dict] = []
    if not winreg:
        logging.debug("winreg not available on this platform")
        return apps

    for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        hive_name = _HIVE_NAMES.get(hive, str(hive))
        for base_key in _UNINSTALL_KEYS:
            try:
                with winreg.OpenKey(hive, base_key) as key:
                    count = winreg.QueryInfoKey(key)[0]
                    for i in range(count):
                        try:
                            subname = winreg.EnumKey(key, i)
                            with winreg.OpenKey(key, subname) as subkey:
                                try:
                                    name = winreg.QueryValueEx(subkey, "DisplayName")[0]
                                except Exception:
                                    continue  # skip entries without a display name

                                def _get(val):
                                    try:
                                        return winreg.QueryValueEx(subkey, val)[0]
                                    except Exception:
                                        return None

                                app = {
                                    "name": name,
                                    "version": _get("DisplayVersion"),
                                    "publisher": _get("Publisher"),
                                    "install_date": _get("InstallDate"),
                                    "install_location": _get("InstallLocation"),
                                    "uninstall_string": _get("UninstallString"),
                                    "display_icon": _get("DisplayIcon"),
                                    "registry_key": f"{hive_name}:{base_key}\\{subname}"
                                }
                                apps.append(app)
                        except Exception as e:
                            logging.debug("skip malformed subkey: %s", e)
                            continue
            except FileNotFoundError:
                continue
            except Exception as e:
                logging.exception("error reading uninstall key %s from %s: %s", base_key, hive_name, e)
    return apps


def get_installed_apps(limit: int = None) -> List[Dict]:
    """
    Return deduplicated list of installed applications on Windows.
    - limit: optional int to truncate results (e.g., 200)
    """
    try:
        apps = _read_registry_uninstall()
        seen = set()
        deduped = []
        for a in apps:
            key = (a.get("registry_key") or (a.get("name") or "").strip().lower(),
                   (a.get("version") or "").strip().lower())
            if key in seen:
                continue
            seen.add(key)
            deduped.append(a)

        if limit is None:
            limit = _MAX_SEND
        if len(deduped) > limit:
            logging.info("Installed apps count %d exceeds limit %d, truncating", len(deduped), limit)
            deduped = deduped[:limit]
        return deduped
    except Exception as e:
        logging.exception("get_installed_apps failed: %s", e)
        return []
