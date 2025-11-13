import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../navigation/sidenav.jsx";
import socket from "../../utils/socket.js";
import "./devices.css";

const Devices = () => {
  const [agents, setAgents] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const [visualizerMap, setVisualizerMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // --- Fetch agents ---
    socket.emit("get_data", { type: "agents" }, (response) => {
      if (!response?.success) {
        setError(response?.message || "Failed to fetch agents.");
        setLoading(false);
        return;
      }

      const data = Array.isArray(response.data) ? response.data : [];
      setAgents(data);
      setLoading(false);
    });

    // --- Fetch logsstatuses ---
    socket.emit("get_data", { type: "logsstatuses" }, (response) => {
      if (response?.success && Array.isArray(response.data)) {
        const latestDoc = response.data[0];
        if (latestDoc?.agents?.length) {
          const statuses = {};
          latestDoc.agents.forEach((agent) => {
            statuses[agent.agentId] = agent.status || "unknown";
          });
          setStatusMap(statuses);
        }
      }
    });

    // --- Fetch visualizer_data ---
    socket.emit("get_data", { type: "visualizer_data" }, (response) => {
      if (response?.success && Array.isArray(response.data)) {
        const map = {};
        response.data.forEach((item) => {
          if (item.agentId && item.ip) {
            map[item.agentId] = item.ip;
          }
        });
        setVisualizerMap(map);
      }
    });

    // --- Live agent updates ---
    socket.on("agent_update", (updatedAgent) => {
      setAgents((prev) => {
        const idx = prev.findIndex((a) => a.agentId === updatedAgent.agentId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = updatedAgent;
          return updated;
        } else {
          return [...prev, updatedAgent];
        }
      });

      if (updatedAgent.status) {
        setStatusMap((prev) => ({
          ...prev,
          [updatedAgent.agentId]: updatedAgent.status,
        }));
      }
    });

    return () => socket.off("agent_update");
  }, []);

  if (loading) return <div className="devices-container">Loading agents...</div>;
  if (error) return <div className="devices-container">{error}</div>;
  if (!agents.length)
    return <div className="devices-container">No agents found.</div>;

  return (
    <div className="device-page">
      <Sidebar />
      <div className="devices-container">
        <h1 className="devices-title">Devices with agents</h1>

        <div className="device-list">
          {agents.map((agent) => {
            const statusFromLogs = statusMap[agent.agentId];
            const ipFromVisualizer = visualizerMap[agent.agentId];
            const isOnline =
              statusFromLogs === "online" ||
              (ipFromVisualizer && ipFromVisualizer.trim() !== "");
            const statusLabel = isOnline ? "Online" : "Offline";

            return (
              <div
                key={agent._id}
                className="device-card"
                onClick={() => navigate(`/devices/${agent.agentId}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 1fr",
                  alignItems: "center",
                  padding: "10px",
                  gap: "10px",
                }}
              >
                {/* LEFT: Device info */}
                <div className="device-left" style={{ display: "flex" }}>
                  <div className="device-icon">🖥️</div>
                  <div className="device-info-wrapper">
                    <div className="device-name">{agent.agentId}</div>
                    <div className="device-info">
                      <p>
                        <strong>IP:</strong> {agent.ip || "unknown"}
                      </p>
                      <p>
                        <strong>Last Seen:</strong>{" "}
                        {agent.lastSeen
                          ? new Date(agent.lastSeen).toLocaleString()
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* CENTER: Status badge */}
                <div
                  className="device-status-center"
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isOnline ? "#dcfce7" : "#fee2e2",
                      padding: "4px 10px",
                      borderRadius: "9999px",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: isOnline ? "#16a34a" : "#dc2626",
                      minWidth: "80px",
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: isOnline ? "#16a34a" : "#dc2626",
                        marginRight: "6px",
                      }}
                    ></span>
                    {statusLabel}
                  </span>
                </div>

                {/* RIGHT: Action buttons */}
                <div
                  className="device-actions"
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                  }}
                >
                  

                  <button
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/tasks/${agent.agentId}`);
                    }}
                  >
                    Task Manager
                    </button>
                 

                  <button
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/apps/${agent.agentId}`);
                    }}
                  >
                    Installed Apps
                  </button>
                  <button disabled
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      alert(`Disconnect ${agent.agentId}`);
                    }}
                  >
                    Disconnect
                  </button>
                 
                  
                  <button disabled
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      alert(`Scan ${agent.agentId}`);
                    }}
                  >
                    Scan
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Devices;
