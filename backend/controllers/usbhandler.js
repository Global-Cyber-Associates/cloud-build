import USBDevices from "../models/UsbDevices.js";
import fs from "fs";
import path from "path";

/**
 * Check USB status for a particular agent.
 * If the USB device exists, return its status.
 * If it doesn't exist, create it with "WaitingForApproval" status.
 * Emits the status back to the agent via socket.
 */
export async function checkUsbStatus(agentId, connectedDevices, socket) {
  if (!connectedDevices || connectedDevices.length === 0) return [];

  // --- Save all received data to JSON for debugging ---
  try {
    const filePath = path.join(process.cwd(), "received.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify({ agentId, timestamp: new Date(), devices: connectedDevices }, null, 2),
      "utf-8"
    );
    console.log(`[💾] Received USB devices logged to: ${filePath}`);
  } catch (err) {
    console.error("❌ Failed to write received.json:", err);
  }

  // --- Ensure agent document exists ---
  let agentDoc = await USBDevices.findOne({ agentId });
  if (!agentDoc) {
    agentDoc = new USBDevices({ agentId, data: { connected_devices: [] } });
    await agentDoc.save();
    console.log(`[🆕] Agent document created for agentId=${agentId}`);
  } else if (!agentDoc.data) {
    agentDoc.data = { connected_devices: [] };
    await agentDoc.save();
    console.log(`[ℹ️] Initialized empty data object for agentId=${agentId}`);
  }

  const results = [];

  for (const device of connectedDevices) {
    const serial = device.serial_number || device.pnpid || "unknown";

    let existingDevice = agentDoc.data.connected_devices.find(d => d.serial_number === serial);

    if (existingDevice) {
      results.push({ ...device, status: existingDevice.status });
      console.log(`[ℹ️] USB exists: ${serial} → status: ${existingDevice.status}`);
    } else {
      const newDeviceEntry = {
        drive_letter: device.drive_letter || "",
        vendor_id: device.vendor_id || "",
        product_id: device.product_id || "",
        description: device.description || "",
        serial_number: serial,
        status: "WaitingForApproval",
        last_seen: new Date(),
      };
      agentDoc.data.connected_devices.push(newDeviceEntry);
      results.push({ ...device, status: "WaitingForApproval" });
      console.log(`[🆕] New USB added: ${serial} → status: WaitingForApproval`);
    }
  }

  // Save updated agent document
  await agentDoc.save();
  console.log("[✅] USB statuses updated for agent:", agentId);

  // --- Send status back to the agent via socket ---
  if (socket && socket.connected) {
    socket.emit("usb_validation", { devices: results });
    console.log("[📡] USB statuses sent back to agent:", results);
  }

  return results;
}
