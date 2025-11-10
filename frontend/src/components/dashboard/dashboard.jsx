import React, { useEffect, useState } from "react";
import "./dashboard.css";
import Sidebar from "../navigation/sidenav.jsx";
import { fetchData } from "../../utils/socket.js";

const Dashboard = () => {
  const [visualizerData, setVisualizerData] = useState([]);
  const [systemInfo, setSystemInfo] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data from socket
  const loadData = async () => {
    setLoading(true);
    try {
      const [vizRes, sysRes, logRes] = await Promise.all([
        fetchData("visualizerData"),
        fetchData("system_info"),
        fetchData("system_logs"),
      ]);

      const latestVisualizer = Object.values(
        (vizRes.data || []).reduce((acc, d) => {
          if (
            !acc[d.agentId] ||
            new Date(d.createdAt) > new Date(acc[d.agentId].createdAt)
          ) {
            acc[d.agentId] = d;
          }
          return acc;
        }, {})
      );

      setVisualizerData(latestVisualizer);
      setSystemInfo(sysRes.data || []);
      setLogs(logRes.data || []);
    } catch (err) {
      console.error("Socket fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  // KPI calculations
  const activeAgents = visualizerData.filter(d =>
    !d.noAgent && systemInfo.some(s => s.agentId === d.agentId)
  );

  const inactiveAgents = systemInfo.filter(
    s => !visualizerData.some(d => d.agentId === s.agentId)
  );

  const unmanagedDevices = visualizerData.filter(d => d.noAgent);

  const logsToday = logs.filter(
    l => new Date(l.timestamp).toDateString() === new Date().toDateString()
  ).length;

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-container">
        <h1 className="dashboard-title">Network & Device Overview</h1>

        {loading ? (
          <p>Loading data...</p>
        ) : (
          <>
            {/* KPI Summary */}
            <div className="stats-grid">
              <div className="stat-card green">
                <h2>Active Agent Devices</h2>
                <p>{activeAgents.length}</p>
              </div>
              <div className="stat-card red">
                <h2>Inactive Agent Devices</h2>
                <p>{inactiveAgents.length}</p>
              </div>
              <div className="stat-card orange">
                <h2>Unmanaged Devices</h2>
                <p>{unmanagedDevices.length}</p>
              </div>
              <div className="stat-card blue">
                <h2>Logs Today</h2>
                <p>{logsToday}</p>
              </div>
            </div>

            {/* Active Agent Table */}
            <div className="table-container">
              <h2>Active Agent Devices</h2>
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Hostname</th>
                    <th>IP</th>
                    <th>CPU Cores</th>
                    <th>RAM Usage</th>
                    <th>OS</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAgents.map(d => {
                    const sys = systemInfo.find(s => s.agentId === d.agentId);
                    return (
                      <tr key={d.agentId}>
                        <td>{sys?.hostname || "-"}</td>
                        <td>{d.ip}</td>
                        <td>{sys?.cpu?.logical_cores || "-"}</td>
                        <td>
                          {sys?.memory?.ram_percent
                            ? sys.memory.ram_percent + "%"
                            : "-"}
                        </td>
                        <td>
                          {sys?.os_type} {sys?.os_release}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Inactive Agent Table */}
            <div className="table-container">
              <h2>Inactive Agent Devices</h2>
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Hostname</th>
                    <th>Last Known IP</th>
                    <th>OS</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveAgents.map(sys => (
                    <tr key={sys.agentId}>
                      <td>{sys.hostname}</td>
                      <td>{sys.wlan_ip?.[0]?.address || "-"}</td>
                      <td>
                        {sys.os_type} {sys.os_release}
                      </td>
                      <td>{new Date(sys.collected_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Unmanaged Devices Table */}
            <div className="table-container">
              <h2>Unmanaged (No Agent) Devices</h2>
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>IP</th>
                    <th>MAC</th>
                    <th>Detected At</th>
                  </tr>
                </thead>
                <tbody>
                  {unmanagedDevices.map(d => (
                    <tr key={d._id}>
                      <td>{d.ip}</td>
                      <td>{d.mac}</td>
                      <td>{new Date(d.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
