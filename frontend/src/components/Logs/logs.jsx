import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import "./logs.css";
import Sidebar from "../navigation/sidenav.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const SOCKET_URL = `${BACKEND_URL}`;

const Logs = () => {
  const [connected, setConnected] = useState(false);
  const [liveLogs, setLiveLogs] = useState([]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => {
      console.log("✅ Connected to socket server");
      setConnected(true);
    });

    socket.on("disconnect", () => {
      console.warn("⚠️ Disconnected from socket server");
      setConnected(false);
    });

    socket.on("logs_status_update", (data) => {
      console.log("🧠 Received logs snapshot:", data);
      const timestamp = new Date(data.timestamp).toLocaleString();
      const newLogs = [];

      // 🧩 Agents
      data.agents?.forEach((agent) => {
        const active =
          Date.now() - new Date(agent.lastSeen).getTime() < 10000
            ? "Logged In"
            : "Logged Off";

        newLogs.push({
          time: timestamp,
          type: "Agent",
          actor: agent.agentId || agent.agentId,
          message: `Agent ${agent.agentId} (${agent.os_type} ${agent.os_version}) ${active}`,
          metadata: `RAM: ${agent.ram_percent}% | CPU: ${agent.cpu_cores} cores | IP: ${agent.ip}`,
        });
      });

      // 🧩 Unknown Devices
      data.unknownDevices?.forEach((dev) => {
        newLogs.push({
          time: timestamp,
          type: "Network",
          actor: "Network Scanner",
          message: `Unknown device detected at ${dev.ip}`,
          metadata: `Vendor: ${dev.vendor}, Hostname: ${dev.hostname}`,
        });
      });

      // 🧩 USB Devices
      data.usbDevices?.forEach((usb) => {
        usb.devices?.forEach((dev) => {
          newLogs.push({
            time: new Date(dev.last_seen).toLocaleString(),
            type: "USB",
            actor: usb.agentId,
            message: `${dev.description} (${dev.drive_letter || "-"}) - ${dev.status}`,
            metadata: `Serial: ${dev.serial_number}`,
          });
        });
      });

      // 🧩 Server
      if (data.server) {
        newLogs.push({
          time: timestamp,
          type: "Server",
          actor: "Backend",
          message: `Server is ${data.server.status.toUpperCase()}`,
          metadata: data.server.message,
        });
      }

      // ✅ Keep logs short and fresh (max 100)
      setLiveLogs((prev) => {
        const updated = [...newLogs, ...prev];
        return updated.slice(0, 100); // 🔥 cut off anything beyond 100
      });
    });

    return () => socket.disconnect();
  }, []);

  // 🧠 Auto-scroll to top (show latest)
  useEffect(() => {
    const container = document.querySelector(".logs-table tbody");
    if (container) container.scrollTop = 0;
  }, [liveLogs]);

  return (
    <div className="logs-page">
      <Sidebar />
      <div className="logs-container">
        <h1 className="logs-title">System Activity Logs</h1>

        <div
          style={{
            color: connected ? "#00ff9d" : "#ff5757",
            background: "#0f2035",
            padding: "8px 12px",
            borderRadius: "8px",
            marginBottom: "12px",
            fontWeight: "500",
          }}
        >
          {connected ? "🟢 Connected to Socket" : "🔴 Disconnected"} |{" "}
          {liveLogs.length ? "Live Logs..." : "Waiting for first update..."}
        </div>

        <div className="logs-table-container">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Category</th>
                <th>Actor</th>
                <th>Message</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {liveLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", opacity: 0.6 }}>
                    No logs yet
                  </td>
                </tr>
              ) : (
                liveLogs.map((log, i) => (
                  <tr key={i} className={`log-row log-${log.type.toLowerCase()}`}>
                    <td>{log.time}</td>
                    <td>{log.type}</td>
                    <td>{log.actor}</td>
                    <td>{log.message}</td>
                    <td>{log.metadata}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Small footer info */}
        <p
          style={{
            fontSize: "12px",
            opacity: 0.6,
            textAlign: "right",
            marginTop: "8px",
          }}
        >
          Showing latest {liveLogs.length}/100 entries
        </p>
      </div>
    </div>
  );
};

export default Logs;
