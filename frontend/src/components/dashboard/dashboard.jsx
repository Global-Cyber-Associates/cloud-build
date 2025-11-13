import React, { useEffect, useState } from "react";
import "./dashboard.css";
import Sidebar from "../navigation/sidenav.jsx";

const Dashboard = () => {
  const [visualizerData, setVisualizerData] = useState([]);
  const [systemInfo, setSystemInfo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const parseDate = (v) => {
    if (!v) return null;
    if (typeof v === "object") {
      if (v.$date) return new Date(v.$date);
      if (v["$date"]) return new Date(v["$date"]);
      if (v.$numberLong) return new Date(Number(v.$numberLong));
      if (v["$numberLong"]) return new Date(Number(v["$numberLong"]));
    }
    return new Date(v);
  };

  const getAgentIPs = (sys) => {
    if (!sys) return [];
    const data = sys.data || sys;
    const wlanArray = Array.isArray(data.wlan_info)
      ? data.wlan_info.map((w) => w.address).filter(Boolean)
      : [];
    const ipCandidates = [
      data.ip,
      data.address,
      data.wlan_ip?.[0]?.address,
      ...wlanArray,
    ].filter(Boolean);
    return Array.from(new Set(ipCandidates));
  };

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [vizRes, sysRes] = await Promise.all([
          fetch("http://localhost:5000/api/visualizer-data"),
          fetch("http://localhost:5000/api/system"),
        ]);

        if (!vizRes.ok || !sysRes.ok) throw new Error("Failed to fetch data");

        const [vizRaw, sysRaw] = await Promise.all([
          vizRes.json(),
          sysRes.json(),
        ]);
        const vizData = Array.isArray(vizRaw) ? vizRaw : [];

        const latestVisualizer = Object.values(
          vizData.reduce((acc, d) => {
            const ip = d.ip;
            if (!ip) return acc;
            const existing = acc[ip];
            const newDate = parseDate(d.createdAt || d.created_at || d.timestamp);
            const existingDate =
              existing && parseDate(existing.createdAt || existing.timestamp);
            if (
              !existing ||
              (newDate && existingDate && newDate > existingDate) ||
              (newDate && !existingDate)
            )
              acc[ip] = d;
            return acc;
          }, {})
        );

        const systemArr = Array.isArray(sysRaw) ? sysRaw : [];

        if (!mounted) return;
        setVisualizerData(latestVisualizer);
        setSystemInfo(systemArr);
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const agentIPs = Array.from(new Set(systemInfo.flatMap((s) => getAgentIPs(s))));

  const activeAgents = visualizerData.filter(
    (d) => !d.noAgent && agentIPs.includes(d.ip)
  );

  const inactiveAgents = systemInfo.filter((sys) => {
    const ips = getAgentIPs(sys);
    if (ips.length === 0) return false;
    return !ips.some((ip) => visualizerData.some((v) => v.ip === ip));
  });

  const unmanagedDevices = visualizerData.filter((d) => d.noAgent === true);

  // ✅ Router detection — includes .1, .2, .250, .253, .254
  const ROUTER_IP_ENDINGS = [1, 2, 250, 253, 254];
  const routers = unmanagedDevices.filter((d) => {
    if (!d.ip) return false;
    const lastOctet = Number(d.ip.split(".")[3]);

    if (ROUTER_IP_ENDINGS.includes(lastOctet) && agentIPs.length === 0)
      return true;

    if (ROUTER_IP_ENDINGS.includes(lastOctet) && agentIPs.length > 0) {
      const subnet = d.ip.split(".").slice(0, 3).join(".");
      const agentSubnetMatch = agentIPs.some(
        (aip) => aip.split(".").slice(0, 3).join(".") === subnet
      );
      return agentSubnetMatch;
    }

    return false;
  });

  const unknownDevices = unmanagedDevices.filter(
    (d) => !routers.some((r) => r.ip === d.ip)
  );

  const allDevices = visualizerData.filter(
    (d) => !routers.some((r) => r.ip === d.ip)
  );

  const findSystemByIp = (ip) =>
    systemInfo.find((s) => getAgentIPs(s).includes(ip));

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-container">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1 className="dashboard-title">Network & Device Overview</h1>
          <div style={{ fontSize: "0.9rem", color: "#666" }}>
            {lastUpdated
              ? `Last update: ${new Date(lastUpdated).toLocaleString()}`
              : "Not updated yet"}
          </div>
        </div>

        {loading ? (
          <p>Loading data...</p>
        ) : (
          <>
            {/* KPI Summary */}
            <div className="stats-grid">
              <div className="stat-card gray">
                <h2>All Devices</h2>
                <p>{allDevices.length}</p>
              </div>
              <div className="stat-card green">
                <h2>Active Agent Devices</h2>
                <p>{activeAgents.length}</p>
              </div>
              <div className="stat-card red">
                <h2>Inactive Agent Devices</h2>
                <p>{inactiveAgents.length}</p>
              </div>
              <div className="stat-card orange">
                <h2>Unknown Devices</h2>
                <p>{unknownDevices.length}</p>
              </div>
              <div className="stat-card blue">
                <h2>Routers</h2>
                <p>{routers.length}</p>
              </div>
            </div>

            {/* All Devices Table */}
            <div className="table-container">
              <h2>All Devices (Excluding Routers)</h2>
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>IP</th>
                    {/* <th>MAC</th> */}
                    <th>Hostname</th>
                    <th>Agent Installed</th>
                    <th>Detected At</th>
                  </tr>
                </thead>
                <tbody>
                  {allDevices.map((d) => (
                    <tr key={d._id || d.ip}>
                      <td>{d.ip}</td>
                      {/* <td>{d.mac || "-"}</td> */}
                      <td>{d.hostname || "-"}</td>
                      <td>{d.noAgent ? "No" : "Yes"}</td>
                      <td>
                        {parseDate(d.createdAt || d.timestamp)?.toLocaleString() ||
                          "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Active Agent Table */}
            <div className="table-container">
              <h2>Active Agent Devices</h2>
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Agent ID</th>
                    <th>Hostname</th>
                    <th>IP</th>
                    <th>CPU Cores</th>
                    <th>RAM Usage</th>
                    <th>OS</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAgents.map((d) => {
                    const sys = findSystemByIp(d.ip);
                    const sdata = sys?.data || sys || {};
                    return (
                      <tr key={d.ip}>
                        <td>{sys?.agentId || "-"}</td>
                        <td>{sdata.hostname || "-"}</td>
                        <td>{d.ip}</td>
                        <td>
                          {sdata.cpu?.logical_cores ??
                            sdata.cpu?.physical_cores ??
                            "-"}
                        </td>
                        <td>
                          {typeof sdata.memory?.ram_percent === "number"
                            ? `${sdata.memory.ram_percent}%`
                            : "-"}
                        </td>
                        <td>
                          {(sdata.os_type || "-") +
                            " " +
                            (sdata.os_release || "")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Unknown Devices Table */}
            <div className="table-container">
              <h2>Unknown Devices</h2>
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>IP</th>
                    {/* <th>MAC</th> */}
                    <th>Detected At</th>
                  </tr>
                </thead>
                <tbody>
                  {unknownDevices.map((d) => {
                    const created = parseDate(
                      d.createdAt || d.created_at || d.timestamp
                    );
                    return (
                      <tr key={d._id?.$oid || d._id || d.ip}>
                        <td>{d.ip}</td>
                        {/* <td>{d.mac || "-"}</td> */}
                        <td>{created ? created.toLocaleString() : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Routers Table */}
            <div className="table-container">
              <h2>Routers</h2>
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>IP</th>
                    {/* <th>MAC</th> */}
                    <th>Detected At</th>
                  </tr>
                </thead>
                <tbody>
                  {routers.map((r) => {
                    const created = parseDate(
                      r.createdAt || r.created_at || r.timestamp
                    );
                    return (
                      <tr key={r._id?.$oid || r._id || r.ip}>
                        <td>{r.ip}</td>
                        {/* <td>{r.mac || "-"}</td> */}
                        <td>{created ? created.toLocaleString() : "-"}</td>
                      </tr>
                    );
                  })}
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
