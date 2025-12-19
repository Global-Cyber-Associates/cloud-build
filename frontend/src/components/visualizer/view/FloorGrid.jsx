import React, { useState, useEffect } from "react";
import { Rnd } from "react-rnd";
import "./FloorGrid.css";
import socket, { fetchData } from "../../../utils/socket.js";

export default function FloorGrid({ floor, updateDevices }) {
  const [devices, setDevices] = useState([]);
  const [gridSize, setGridSize] = useState(100);
  const [locked, setLocked] = useState(false);
  const [cols, setCols] = useState(5);

  // ✅ Sync devices from parent prop
  useEffect(() => {
    if (floor && floor.devices) {
        setDevices(floor.devices); 
    }
  }, [floor]);

  // ✅ Improved router detection logic
  const isRouterDevice = (ip) => {
    if (!ip) return false;
    return (
      ip.endsWith(".0.1") ||
      ip.endsWith(".1.1") ||
      ip.endsWith(".254") ||
      ip.endsWith(".1.254") ||
      ip.endsWith(".0.254") ||
      ip.endsWith(".43.1") || // Android standard
      ip.endsWith(".137.1") || // Windows hotspot
      ip.endsWith(".2.1") || // macOS Internet Sharing
      ip.endsWith(".10.1") || // iPhone hotspot
      ip.endsWith(".248.1") || // Some Android hotspots
      ip.endsWith(".225.1") || // Reliance Jio pattern
      ip.endsWith(".42.129") // Some MediaTek phones
    );
  };

  const formatDevices = (data, colCount) => {
    return data.map((d, i) => {
      const ip = d.ip || "N/A";
      const router = isRouterDevice(ip);
      return {
        id: d._id || d.id,
        name: router ? "Router" : d.agentId || "Unknown",
        ip,
        mac: d.mac || "Unknown",
        noAgent: d.noAgent,
        isRouter: router,
        icon: router ? "🛜" : d.noAgent ? "🖥️" : "💻",
        x: (i % colCount) * 160 + 40,
        y: Math.floor(i / colCount) * 160 + 40,
      };
    });
  };

  const updatePosition = (id, x, y) => {
    const updatedDevices = devices.map((d) => (d.id === id ? { ...d, x, y } : d));
    setDevices(updatedDevices);
    updateDevices(updatedDevices);
    socket.emit("update_device_position", { id, x, y });
  };

  return (
    <div className="V-container">
      <div className="V-controls">
        <button className="V-lock-btn" onClick={() => setLocked(!locked)}>
          {locked ? "🔒 Locked" : "🔓 Free Move"}
        </button>

        <label className="V-grid-label">
          Columns:
          <input
            type="number"
            min="1"
            max="10"
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="V-grid" style={{ backgroundSize: `${gridSize}px ${gridSize}px` }}>
        {devices.map((dev) => (
          <Rnd
            key={dev.id}
            bounds="parent"
            size={{
              width: dev.isRouter ? gridSize * 1.1 : gridSize * 0.8,
              height: dev.isRouter ? gridSize * 1.1 : gridSize * 0.8,
            }}
            position={{ x: dev.x, y: dev.y }}
            disableDragging={locked}
            onDragStop={(e, d) => updatePosition(dev.id, d.x, d.y)}
          >
            <div
              className={`V-device-box ${
                dev.isRouter ? "V-router" : dev.noAgent ? "V-no-agent" : "V-active"
              }`}
              title={`Type: ${
                dev.isRouter ? "Router" : dev.noAgent ? "Unmanaged Device" : "Active Agent"
              }\nHostname: ${dev.name}\nIP: ${dev.ip}\nMAC: ${dev.mac}`}
            >
              <span className="V-device-icon">{dev.icon}</span>
              <div className="V-device-name">{dev.name}</div>
              <div className="V-device-ip">{dev.ip}</div>
            </div>
          </Rnd>
        ))}
      </div>
    </div>
  );
}
