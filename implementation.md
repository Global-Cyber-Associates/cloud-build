# Architecture: Zero-Touch Hardware Licensing System

This document explains the "Hands-Off" licensing architecture integrated into GCA Visus. It ensures that agents are securely bound to hardware, automatically configured, and strictly controlled by the central administration.

---

## 1. The Core Protection Layers

### 🔒 Hardware Fingerprinting
The agent generates a unique **Hardware Identity** (H-ID) by hashing machine-specific identifiers:
- **Microsoft MachineGuid**: A unique ID generated during Windows installation.
- **CPU Silicon ID**: Tied to the physical processor.
- **Disk Serial Number**: Tied to the system drive's firmware.
- **Outcome**: A SHA-256 fingerprint ensures the license cannot be spoofed or moved to another machine.

### 🛡️ Dual-End Enforcement
- **Agent Guard**: A local kill-switch blocks all scanning and data transmission if the license is absent or invalid.
- **Server Guard**: The backend validates the `isLicensed` flag for every single socket message. Unauthorized data is instantly rejected.

---

## 2. Operational Lifecycle

### Phase 1: Zero-Touch Enrollment
1.  **Start**: Agent starts $\rightarrow$ Generates Fingerprint.
2.  **Lookup**: Agent pings `/api/license/verify-hardware`. If known, it recovers the `TENANT_KEY`.
3.  **Bootstrap**: If new, it reads a local `license.key` file and calls `/api/license/bootstrap`.
4.  **Auto-Config**: The agent **writes its own `.env` file** and connects to the backend.

### Phase 2: Manual Admin Approval
1.  **Pending State**: The agent appears in the **License Manager** UI as **PENDING**.
2.  **Admin Action**: The Administrator reviews the hardware details and clicks **"Approve"**.
3.  **Real-Time Activation**: 
    - Server emits a `license_approved` signal.
    - Agent receives signal $\rightarrow$ Requests Activation Token.
    - Server verifies seats and issues an **RS256-Signed JWT**.
4.  **Full Operation**: Agent saves the token and begins system monitoring.

### Phase 3: Revocation
1.  **Kill Signal**: Admin clicks **"Revoke"** in the UI.
2.  **Instant Shutdown**: The socket emits a revocation signal; the server clears the license flag.
3.  **Result**: Transmission stops immediately in the current session.

---

## 3. Component Map 🗺️
| Component | Function |
| :--- | :--- |
| `backend/src/api/license.js` | Identity discovery & bootstrapping endpoints. |
| `backend/src/controllers/adminController.js`| Manual approval and seat management logic. |
| `agent/functions/license.py` | Native bridge for hardware identity generation. |
| `agent/functions/sender.py` | Real-time signal handling and data-flow gatekeeper. |
| `LicenseManager.jsx` | Command center for hardware binding and approvals. |

---

## 4. Admin Verification Guide
- **Approval Test**: Connect a new agent $\rightarrow$ verify it shows "Pending" $\rightarrow$ click "Approve" $\rightarrow$ verify the agent logs show `[🔓] Approved`.
- **Hardware Swap Test**: Move the `license.token` to a new machine $\rightarrow$ verify the agent rejects it due to fingerprint mismatch.
- **Seat Limit Test**: Lower the seat limit below the active count $\rightarrow$ attempts to approve new agents will be blocked.
