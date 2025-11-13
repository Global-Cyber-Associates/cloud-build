import React, { useState, useEffect } from "react";
import { Rnd } from "react-rnd";
import "./FloorGrid.css";
import socket, { fetchData } from "../../../utils/socket.js";

export default function FloorGrid({ floor, updateDevices }) {
  const [devices, setDevices] = useState([]);
  const [gridSize, setGridSize] = useState(100);
  const [locked, setLocked] = useState(false);
  const [cols, setCols] = useState(5);
  const [rows, setRows] = useState(3);

  useEffect(() => {
    const init = async () => {
      // Wait for socket to connect
      if (!socket.connected) {
        await new Promise((resolve) => socket.once("connect", resolve));
      }

      // Fetch initial devices once
      try {
        const res = await fetchData("visualizer_data");
        const data = res?.data || [];
        const formatted = formatDevices(data, cols);
        setDevices(formatted);
        updateDevices(formatted);
      } catch (err) {
        console.error("❌ Failed to fetch devices via socket:", err);
      }
    };

    init();

    // Listen for real-time updates
    const handleUpdate = (deviceUpdate) => {
      setDevices((prev) => {
        const exists = prev.find((d) => d.id === deviceUpdate.id || d.ip === deviceUpdate.ip);
        if (exists) {
          return prev.map((d) =>
            d.id === deviceUpdate.id || d.ip === deviceUpdate.ip ? { ...d, ...deviceUpdate } : d
          );
        } else {
          return [...prev, deviceUpdate];
        }
      });
    };

    socket.on("visualizer_update", handleUpdate);

    return () => {
      socket.off("visualizer_update", handleUpdate);
    };
  }, [cols]); // only depend on cols if you want initial grid placement to respect it

  const formatDevices = (data, colCount) => {
    return data.map((d, i) => {
      const ip = d.ip || "N/A";
      const isRouter = ip.endsWith(".0.1") || ip.endsWith(".1.1");
      return {
        id: d._id || d.id,
        name: d.agentId || "Unknown",
        ip,
        mac: d.mac || "Unknown",
        noAgent: d.noAgent,
        icon: isRouter ? "🛜" : d.noAgent ? "🖥️" : "💻",
        x: (i % colCount) * 160 + 40,
        y: Math.floor(i / colCount) * 160 + 40,
      };
    });
  };

  const updatePosition = (id, x, y) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, x, y } : d))
    );
    updateDevices(devices);
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

        {/* <label className="V-grid-label">
          Rows:
          <input
            type="number"
            min="1"
            max="10"
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
        </label> */}
      </div>

      <div className="V-grid" style={{ backgroundSize: `${gridSize}px ${gridSize}px` }}>
        {devices.map((dev) => (
          <Rnd
            key={dev.id}
            bounds="parent"
            size={{ width: gridSize * 0.8, height: gridSize * 0.8 }}
            position={{ x: dev.x, y: dev.y }}
            disableDragging={locked}
            onDragStop={(e, d) => updatePosition(dev.id, d.x, d.y)}
          >
            <div
              className={`V-device-box ${dev.noAgent ? "V-no-agent" : "V-active"}`}
              title={`Hostname: ${dev.name}\nIP: ${dev.ip}\nMAC: ${dev.mac}\nAgent: ${
                dev.noAgent ? "Not Installed" : "Active"
              }`}
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
