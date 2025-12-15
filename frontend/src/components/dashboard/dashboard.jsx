import React, { useEffect, useState } from "react";
import "./dashboard.css";
import Sidebar from "../navigation/sidenav.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// ================================
// SAFE FORMATTERS
// ================================
function formatCPU(cpu) {
  if (!cpu) return "-";
  return `${cpu.physical_cores}C/${cpu.logical_cores}T @ ${cpu.cpu_freq_mhz} MHz`;
}

function formatRAM(mem) {
  if (!mem) return "-";
  const gb = (mem.total_ram / 1024 / 1024 / 1024).toFixed(1);
  return `${gb} GB`;
}

function formatOS(os) {
  if (!os) return "-";
  return os;
}

function formatTime(t) {
  if (!t) return "-";
  return new Date(t).toLocaleString();
}

const Dashboard = () => {
  const [snapshot, setSnapshot] = useState({
    summary: { all: 0, active: 0, inactive: 0, unknown: 0, routers: 0 },
    allDevices: [],
    activeAgents: [],
    inactiveAgents: [],
    unknownDevices: [],
    routers: [],
  });

  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let interval = null;
    let aborter = null;

    const fetchSnap = async () => {
      try {
        if (aborter) aborter.abort();
        aborter = new AbortController();

        const res = await fetch(`${BACKEND_URL}/api/dashboard`, {
          signal: aborter.signal,
        });

        if (!res.ok) throw new Error("Dashboard fetch failed");
        const snap = await res.json();

        setSnapshot(snap);
        setLastUpdated(new Date());
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
      }
    };

    fetchSnap();
    interval = setInterval(fetchSnap, 1500);

    return () => {
      if (aborter) aborter.abort();
      clearInterval(interval);
    };
  }, []);

  const {
    summary,
    allDevices,
    activeAgents,
    inactiveAgents,
    unknownDevices,
    routers,
  } = snapshot;

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-container">
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h1 className="dashboard-title">Network & Device Overview</h1>
          <div style={{ fontSize: "0.9rem", color: "#666" }}>
            Last update: {lastUpdated?.toLocaleString()}
          </div>
        </div>

        {/* KPI SUMMARY */}
        <div className="stats-grid">
          <div className="stat-card gray">
            <h2>All Devices</h2>
            <p>{summary.all}</p>
          </div>
          <div className="stat-card green">
            <h2>Active Agents</h2>
            <p>{summary.active}</p>
          </div>
          <div className="stat-card red">
            <h2>Inactive Agents</h2>
            <p>{summary.inactive}</p>
          </div>
          <div className="stat-card orange">
            <h2>Unknown Devices</h2>
            <p>{summary.unknown}</p>
          </div>
          <div className="stat-card blue">
            <h2>Routers</h2>
            <p>{summary.routers}</p>
          </div>
        </div>

        {/* ================================
            ALL DEVICES TABLE
        ================================= */}
        <div className="table-container">
          <h2>All Devices</h2>
          <table className="activity-table">
            <thead>
              <tr>
                <th>IP</th>
                <th>Hostname</th>
                <th>Agent</th>
                <th>CPU</th>
                <th>RAM</th>
                <th>OS</th>
                <th>Detected At</th>
              </tr>
            </thead>
            <tbody>
              {allDevices.map((d) => (
                <tr key={d.ip}>
                  <td>{d.ip}</td>
                  <td>{d.hostname || "-"}</td>
                  <td>{d.noAgent ? "No" : "Yes"}</td>
                  <td>{formatCPU(d.cpu)}</td>
                  <td>{formatRAM(d.memory)}</td>
                  <td>{formatOS(d.os)}</td>
                  <td>{formatTime(d.timestamp || d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ================================
            ACTIVE AGENTS TABLE
        ================================= */}
        <div className="table-container">
          <h2>Active Agents</h2>
          <table className="activity-table">
            <thead>
              <tr>
                <th>Agent ID</th>
                <th>Hostname</th>
                <th>IP</th>
                <th>CPU</th>
                <th>RAM</th>
                <th>OS</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {activeAgents.map((a) => (
                <tr key={a.ip}>
                  <td>{a.agentId || "-"}</td>
                  <td>{a.hostname || a.system?.hostname || "-"}</td>
                  <td>{a.ip}</td>
                  <td>{formatCPU(a.cpu)}</td>
                  <td>{formatRAM(a.memory)}</td>
                  <td>{formatOS(a.os)}</td>
                  <td>{formatTime(a.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ================================
            INACTIVE AGENTS TABLE
        ================================= */}
        <div className="table-container">
          <h2>Inactive Agents</h2>
          <table className="activity-table">
            <thead>
              <tr>
                <th>Agent ID</th>
                <th>Hostname</th>
                <th>IP</th>
                <th>CPU</th>
                <th>RAM</th>
                <th>OS</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {inactiveAgents.map((a) => {
                const sys = a.data || {};
                return (
                  <tr key={sys.ip}>
                    <td>{a.agentId || "-"}</td>
                    <td>{sys.hostname || "-"}</td>
                    <td>{sys.ip}</td>
                    <td>{formatCPU(sys.cpu)}</td>
                    <td>{formatRAM(sys.memory)}</td>
                    <td>{formatOS(sys.os_type)}</td>
                    <td>{formatTime(a.timestamp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ================================
            UNKNOWN DEVICES
        ================================= */}
        <div className="table-container">
          <h2>Unknown Devices</h2>
          <table className="activity-table">
            <thead>
              <tr>
                <th>IP</th>
                <th>Detected At</th>
              </tr>
            </thead>
            <tbody>
              {unknownDevices.map((d) => (
                <tr key={d.ip}>
                  <td>{d.ip}</td>
                  <td>{formatTime(d.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ================================
            ROUTERS
        ================================= */}
        <div className="table-container">
          <h2>Routers</h2>
          <table className="activity-table">
            <thead>
              <tr>
                <th>IP</th>
                <th>Detected At</th>
              </tr>
            </thead>
            <tbody>
              {routers.map((r) => (
                <tr key={r.ip}>
                  <td>{r.ip}</td>
                  <td>{formatTime(r.timestamp || r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
