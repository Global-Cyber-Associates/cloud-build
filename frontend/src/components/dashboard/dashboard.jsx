import React, { useEffect, useState } from "react";
import "./dashboard.css";
import Sidebar from "../navigation/sidenav.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const Dashboard = () => {
  const [snapshot, setSnapshot] = useState(null);
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

  if (!snapshot) {
    return (
      <div className="dashboard">
        <Sidebar />
        <div className="dashboard-container">
          <h1 className="dashboard-title">Loading dashboard...</h1>
        </div>
      </div>
    );
  }

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
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h1 className="dashboard-title">Network & Device Overview</h1>

          <div style={{ fontSize: "0.9rem", color: "#666" }}>
            Last update: {lastUpdated?.toLocaleString()}
          </div>
        </div>

        {/* KPI Summary */}
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

        {/* All Devices Table */}
        <div className="table-container">
          <h2>All Devices</h2>
          <table className="activity-table">
            <thead>
              <tr>
                <th>IP</th>
                <th>Hostname</th>
                <th>Agent</th>
                <th>Detected At</th>
              </tr>
            </thead>
            <tbody>
              {allDevices.map((d) => (
                <tr key={d.ip}>
                  <td>{d.ip}</td>
                  <td>{d.hostname || "-"}</td>
                  <td>{d.noAgent ? "No" : "Yes"}</td>
                  <td>{new Date(d.timestamp || d.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Active Agents */}
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
              </tr>
            </thead>
            <tbody>
              {activeAgents.map((a) => (
                <tr key={a.ip}>
                  <td>{a.agentId || "-"}</td>
                  <td>{a.hostname || "-"}</td>
                  <td>{a.ip}</td>
                  <td>{a.cpu || "-"}</td>
                  <td>{a.ram || "-"}</td>
                  <td>{a.os || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Unknown */}
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
                  <td>{new Date(d.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Routers */}
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
                  <td>{new Date(r.timestamp).toLocaleString()}</td>
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
