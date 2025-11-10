// src/components/UsbControl.jsx
import React, { useState, useEffect } from "react";
import Sidebar from "../navigation/sidenav";
import "./usb.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const UsbControl = () => {
  const [usbData, setUsbData] = useState([]);
  const [selectedUsb, setSelectedUsb] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchUsbData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/usb`);
      const data = await res.json();
      setUsbData(data);
    } catch (err) {
      console.error("Failed to fetch USB data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsbData();
  }, []);

  const getUniqueDevices = () => {
    const map = new Map();
    usbData.forEach((agent) => {
      agent.data?.connected_devices?.forEach((device) => {
        if (!map.has(device.serial_number)) {
          map.set(device.serial_number, {
            ...device,
            users: [],
          });
        }
        map.get(device.serial_number).users.push({
          username: agent.agentId,
          status: device.status,
        });
      });
    });
    return Array.from(map.values());
  };

  const uniqueDevices = getUniqueDevices();

  // Handle status change for a specific user and device
  const handleStatusChange = async (username, serial, newStatus) => {
    try {
      await fetch(`${BACKEND_URL}/api/usb/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, serial, status: newStatus }),
      });

      // Update local state
      setUsbData((prev) =>
        prev.map((agent) =>
          agent.agentId === username
            ? {
                ...agent,
                data: {
                  ...agent.data,
                  connected_devices: agent.data.connected_devices.map((d) =>
                    d.serial_number === serial ? { ...d, status: newStatus } : d
                  ),
                },
              }
            : agent
        )
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  if (loading) {
    return (
      <div className="usb-control-container dark">
        <Sidebar />
        <main className="usb-main">
          <p className="loading">Loading...</p>
        </main>
      </div>
    );
  }

  // Render USB device list
  const renderDeviceList = () => (
    <div className="table-wrapper">
      <table className="usb-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Vendor</th>
            <th>Serial</th>
            <th>Last Seen</th>
            <th>Users Count</th>
          </tr>
        </thead>
        <tbody>
          {uniqueDevices.map((device) => (
            <tr
              key={device.serial_number}
              onClick={() => setSelectedUsb(device.serial_number)}
              className="clickable"
            >
              <td>{device.description}</td>
              <td>{device.vendor_id}</td>
              <td>{device.serial_number}</td>
              <td>{new Date(device.last_seen).toLocaleString()}</td>
              <td>{device.users.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Render user access for selected USB
  const renderUserAccess = () => {
    const device = uniqueDevices.find((d) => d.serial_number === selectedUsb);
    if (!device) return null;

    return (
      <div className="usb-user-details">
        <button className="back-btn" onClick={() => setSelectedUsb(null)}>
          ← Back to USB List
        </button>
        <h2>Users with access to: {device.description}</h2>
        <table className="usb-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Last Seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {device.users.map((user, idx) => {
              const agentDevice = usbData
                .find((a) => a.agentId === user.username)
                ?.data?.connected_devices?.find((d) => d.serial_number === selectedUsb);

              return (
                <tr key={idx}>
                  <td>{user.username}</td>
                  <td>{agentDevice ? new Date(agentDevice.last_seen).toLocaleString() : "-"}</td>
                  <td>
                    <select
  className={`status-select ${
    user.status === "Allowed"
      ? "allowed"
      : user.status === "Blocked"
      ? "blocked"
      : "waiting"
  }`}
  value={user.status}
  onChange={(e) =>
    handleStatusChange(user.username, selectedUsb, e.target.value)
  }
>
  <option value="Allowed">Allowed</option>
  <option value="Blocked">Blocked</option>
  <option value="WaitingForApproval">Waiting For Approval</option>
</select>

                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="usb-control-container dark">
      <Sidebar />
      <main className="usb-main">
        <header className="usb-header">
          <h1>USB Access Control</h1>
          <p>
            {selectedUsb
              ? "View users and update their access statuses."
              : "Click a USB device to see users who have access."}
          </p>
        </header>
        {selectedUsb ? renderUserAccess() : renderDeviceList()}
      </main>
    </div>
  );
};

export default UsbControl;
