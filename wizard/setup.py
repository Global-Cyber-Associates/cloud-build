import sys
import os
import shutil
import subprocess
import time
import traceback
import zipfile

# -------------------------------------------------------------------
# Step 1: Ensure Required Packages Are Installed
# -------------------------------------------------------------------
required_packages = ["PyQt6", "requests"]

def install_missing_packages():
    missing = []
    for pkg in required_packages:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)

    if missing:
        print(f"[📦] Installing missing packages: {', '.join(missing)}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])
        print("[✅] All dependencies installed.\n")

install_missing_packages()

from PyQt6.QtWidgets import (
    QApplication, QWizard, QWizardPage, QVBoxLayout, QLabel,
    QLineEdit, QPushButton, QFileDialog, QProgressBar,
    QMessageBox, QCheckBox
)
from PyQt6.QtCore import QThread, pyqtSignal
import requests


# -------------------------------------------------------------------
# Step 3: Background Installation Worker
# -------------------------------------------------------------------
class InstallWorker(QThread):
    progress = pyqtSignal(int)
    status = pyqtSignal(str)
    finished = pyqtSignal(bool, str)

    def __init__(self, install_path, agent_id, backend_url):
        super().__init__()
        self.install_path = install_path
        self.agent_id = agent_id
        self.backend_url = backend_url
        self.update_url = "http://4.213.152.243/agent.zip"  # CDN zip file

    def check_cdn_reachable(self):
        """Check if CDN URL exists and is reachable."""
        self.status.emit("Checking CDN reachability...")
        try:
            response = requests.head(self.update_url, timeout=5)
            if response.status_code == 200:
                return True
            else:
                self.status.emit(f"CDN responded with HTTP {response.status_code}")
                return False
        except Exception as e:
            self.status.emit(f"CDN check failed: {e}")
            return False

    def download_zip(self, dest_path):
        """Downloads the ZIP from CDN with progress updates."""
        self.status.emit("Downloading agent package...")
        try:
            with requests.get(self.update_url, stream=True, timeout=15) as r:
                r.raise_for_status()
                total_size = int(r.headers.get("content-length", 0))
                downloaded = 0
                with open(dest_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                self.progress.emit(30 + int((downloaded / total_size) * 40))
            return True
        except Exception as e:
            self.status.emit(f"❌ Download failed: {e}")
            return False

    def extract_zip(self, zip_path):
        """Extracts the downloaded ZIP file."""
        self.status.emit("Extracting agent files...")
        try:
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(self.install_path)
            os.remove(zip_path)
            return True
        except Exception as e:
            self.status.emit(f"❌ Extraction failed: {e}")
            return False

    def run(self):
        try:
            os.makedirs(self.install_path, exist_ok=True)

            self.progress.emit(10)
            self.status.emit("Validating CDN URL...")

            # --- Step 1: Validate CDN URL ---
            if not self.check_cdn_reachable():
                self.finished.emit(False, f"❌ CDN unreachable or invalid:\n{self.update_url}")
                return

            self.progress.emit(20)
            self.status.emit("Writing configuration file (.env)...")

            # --- Step 2: Write .env ---
            env_content = (
                f"AGENT_ID={self.agent_id}\n"
                f"BACKEND_URL={self.backend_url}\n"
                f"UPDATE_URL={self.update_url}\n"
            )
            env_path = os.path.join(self.install_path, ".env")
            with open(env_path, "w") as f:
                f.write(env_content)

            # --- Step 3: Download and Extract ZIP ---
            zip_path = os.path.join(self.install_path, "agent.zip")

            self.progress.emit(30)
            if not self.download_zip(zip_path):
                self.finished.emit(False, "❌ Failed to download the agent package.")
                return

            self.progress.emit(70)
            if not self.extract_zip(zip_path):
                self.finished.emit(False, "❌ Failed to extract the agent package.")
                return

            self.progress.emit(90)
            self.status.emit("Finalizing installation...")
            time.sleep(0.3)

            self.finished.emit(True, f"✅ Installation completed successfully!\nInstalled at:\n{self.install_path}")

        except Exception as e:
            error_text = f"❌ Error during installation:\n{e}\n\n{traceback.format_exc()}"
            self.finished.emit(False, error_text)


# -------------------------------------------------------------------
# Step 4: Wizard Pages
# -------------------------------------------------------------------
class WelcomePage(QWizardPage):
    def __init__(self):
        super().__init__()
        self.setTitle("Welcome to System Monitor Setup")
        layout = QVBoxLayout()
        label = QLabel(
            "This wizard will install the System Monitor Agent on your computer.\n\n"
            "It will configure your Agent ID and Backend URL for admin access.\n"
            "Click Next to continue."
        )
        label.setWordWrap(True)
        layout.addWidget(label)
        self.setLayout(layout)


class ConfigPage(QWizardPage):
    def __init__(self):
        super().__init__()
        self.setTitle("Agent Configuration")

        self.agent_id = QLineEdit()
        self.backend_url = QLineEdit()

        layout = QVBoxLayout()
        layout.addWidget(QLabel("Enter your Agent ID:"))
        layout.addWidget(self.agent_id)
        layout.addWidget(QLabel("Enter Backend URL (for admin panel):"))
        layout.addWidget(self.backend_url)
        self.setLayout(layout)

    def validatePage(self):
        if not self.agent_id.text().strip() or not self.backend_url.text().strip():
            QMessageBox.warning(self, "Missing Information", "Please fill in both Agent ID and Backend URL.")
            return False
        return True


class DirectoryPage(QWizardPage):
    def __init__(self):
        super().__init__()
        self.setTitle("Choose Installation Folder")

        self.path_input = QLineEdit()
        browse_btn = QPushButton("Browse")
        browse_btn.clicked.connect(self.browse)

        layout = QVBoxLayout()
        layout.addWidget(QLabel("Select installation folder:"))
        layout.addWidget(self.path_input)
        layout.addWidget(browse_btn)
        self.setLayout(layout)

    def browse(self):
        path = QFileDialog.getExistingDirectory(self, "Select Installation Folder")
        if path:
            self.path_input.setText(path)

    def validatePage(self):
        if not self.path_input.text().strip():
            QMessageBox.warning(self, "Missing Folder", "Please select an installation folder.")
            return False

        install_path = self.path_input.text().strip()
        if os.path.exists(os.path.join(install_path, "main.py")):
            reply = QMessageBox.question(
                self,
                "Existing Installation Found",
                "An installation already exists in this folder.\n"
                "Do you want to overwrite it?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )
            if reply == QMessageBox.StandardButton.No:
                return False
        return True


class InstallPage(QWizardPage):
    def __init__(self):
        super().__init__()
        self.setTitle("Installing System Monitor")
        self.progress = QProgressBar()
        self.status = QLabel("Preparing installation...")
        layout = QVBoxLayout()
        layout.addWidget(self.status)
        layout.addWidget(self.progress)
        self.setLayout(layout)
        self.worker = None

    def initializePage(self):
        install_path = self.wizard().page(2).path_input.text()
        agent_id = self.wizard().page(1).agent_id.text()
        backend_url = self.wizard().page(1).backend_url.text()

        self.worker = InstallWorker(install_path, agent_id, backend_url)
        self.worker.progress.connect(self.progress.setValue)
        self.worker.status.connect(self.status.setText)
        self.worker.finished.connect(self.on_finished)
        self.worker.start()

    def on_finished(self, success, message):
        self.status.setText(message)
        if success:
            self.progress.setValue(100)
        else:
            self.progress.setStyleSheet("QProgressBar::chunk { background-color: red; }")
            QMessageBox.critical(self, "Installation Failed", message)


class FinishPage(QWizardPage):
    def __init__(self):
        super().__init__()
        self.setTitle("Installation Complete")
        self.launch_checkbox = QCheckBox("Launch System Monitor Agent now")
        layout = QVBoxLayout()
        label = QLabel(
            "System Monitor Agent has been installed successfully.\n"
            "You can start it immediately or close the installer."
        )
        label.setWordWrap(True)
        layout.addWidget(label)
        layout.addWidget(self.launch_checkbox)
        self.setLayout(layout)

    def cleanupPage(self):
        if self.launch_checkbox.isChecked():
            install_path = self.wizard().page(2).path_input.text()
            main_script = os.path.join(install_path, "main.py")
            if os.path.exists(main_script):
                subprocess.Popen([sys.executable, main_script])
                QMessageBox.information(self, "Running", "System Monitor Agent has started.")


# -------------------------------------------------------------------
# Step 5: Wizard Controller
# -------------------------------------------------------------------
class InstallerWizard(QWizard):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("System Monitor Agent Setup Wizard")
        self.setWizardStyle(QWizard.WizardStyle.ModernStyle)
        self.setFixedSize(520, 380)

        self.addPage(WelcomePage())
        self.addPage(ConfigPage())
        self.addPage(DirectoryPage())
        self.addPage(InstallPage())
        self.addPage(FinishPage())


# -------------------------------------------------------------------
# Step 6: Entry Point
# -------------------------------------------------------------------
if __name__ == "__main__":
    try:
        app = QApplication(sys.argv)
        wizard = InstallerWizard()
        wizard.show()
        sys.exit(app.exec())
    except Exception as e:
        print("❌ Critical error launching installer:", e)
        traceback.print_exc()
