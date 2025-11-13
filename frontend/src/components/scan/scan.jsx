import React, { useState, useEffect } from "react";
import "./scan.css";
import Sidebar from "../navigation/sidenav.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/";

function guessVendorFromMac(mac) {
  if (!mac) return null;
  const prefix = mac.toLowerCase().replace(/-/g, ":").split(":").slice(0, 3).join(":");
  const map = {
    "44:65:0d": "Apple, Inc.",
    "54:ea:3a": "Samsung Electronics",
    "3c:5a:b4": "Xiaomi",
    "fc:25:3f": "Huawei",
    "c8:2a:14": "OnePlus",
  };
  return map[prefix] || null;
}

function isMobileVendor(vendor) {
  if (!vendor) return false;
  const s = vendor.toLowerCase();
  return ["apple", "samsung", "xiaomi", "huawei", "oneplus", "pixel", "realme", "vivo"].some(k => s.includes(k));
}

const Scan = () => {
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [previousScan, setPreviousScan] = useState(null);
  const [error, setError] = useState("");
  const [rawResponse, setRawResponse] = useState(null);

  // === Fetch previous scan from DB on mount ===
  useEffect(() => {
    const fetchPreviousScan = async () => {
      try {
        const res = await fetch(`${backendUrl.replace(/\/$/, "")}/api/scan/latest`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        setPreviousScan(data);
      } catch (err) {
        console.warn("No previous scan data available:", err.message);
      }
    };
    fetchPreviousScan();
  }, []);

  // === Map backend response into table-friendly objects ===
  const mapScannerResponseToDevices = (data) => {
    const hosts = data?.result?.hosts || data?.hosts || [];
    return hosts.map(h => ({
      ips: h.ips || (h.ip ? [h.ip] : []),
      mac: h.mac || null,
      vendor: h.vendor || guessVendorFromMac(h.mac) || "-",
      mobile: isMobileVendor(h.vendor),
      _meta: {
        open_ports: h.open_ports || {},
        vuln_flags: h.vuln_flags || [],
        raw: h
      }
    }));
  };

  // === Trigger a new scan ===
  const runScan = async () => {
    setLoading(true);
    setError("");
    setDevices([]);
    setRawResponse(null);

    try {
      console.log("Starting network scan...");
      const res = await fetch(`${backendUrl.replace(/\/$/, "")}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      console.log("Response status:", res.status);
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        console.error("Invalid JSON:", e, text);
        throw new Error(`Invalid JSON from server: ${e.message}`);
      }

      setRawResponse(data);

      if (!res.ok) {
        const serverMsg = (data && (data.error || data.message)) || `Server returned ${res.status}`;
        throw new Error(serverMsg);
      }

      console.log("Scan response data:", data);
      const devicesList = mapScannerResponseToDevices(data);

      if (!devicesList || devicesList.length === 0) {
        setError("No devices found.");
        setDevices([]);
      } else {
        setDevices(devicesList);
      }

      // After running a scan, update previousScan from DB
      const updated = await fetch(`${backendUrl.replace(/\/$/, "")}/api/scan/latest`);
      if (updated.ok) {
        const latest = await updated.json();
        setPreviousScan(latest);
      }
    } catch (err) {
      console.error("Scan error:", err);
      setError(err.message || "Failed to fetch scan results");
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  // === Table renderer ===
  const renderDeviceTable = (deviceArray) => (
    <div className="scan-output-table">
      <div className="table-wrapper">
        <table className="styled-scan-table">
          <thead>
            <tr>
              <th>IP Address</th>
              <th>MAC</th>
              <th>Vendor</th>
              <th>Mobile</th>
              <th>Open Ports</th>
              <th>Vulnerabilities</th>
            </tr>
          </thead>
          <tbody>
            {deviceArray.map((d, index) => (
              <tr key={index}>
                <td>
                  {d.ips?.length
                    ? d.ips.map((ip, i) => (
                        <span key={i} className="ip-badge">{ip}</span>
                      ))
                    : "-"}
                </td>
                <td>{d.mac || "-"}</td>
                <td className={d.vendor && d.vendor !== "-" ? "vendor-known" : "vendor-unknown"}>
                  {d.vendor && d.vendor !== "-" ? d.vendor : "-"}
                </td>
                <td>
                  <span className={`mobile-tag ${d.mobile ? "yes" : "no"}`}>
                    {d.mobile ? "Yes" : "No"}
                  </span>
                </td>
                <td>
                  {d._meta?.open_ports && Object.keys(d._meta.open_ports).length > 0 ? (
                    <div className="ports-cell">
                      {Object.entries(d._meta.open_ports).map(([p, info]) => (
                        <div key={p} className="port-item">
                          <strong>{p}</strong>
                          {info.banner ? ` — ${info.banner.split("\n")[0].slice(0, 80)}` : ""}
                        </div>
                      ))}
                    </div>
                  ) : <span>-</span>}
                </td>
                <td>
                  {d._meta?.vuln_flags && d._meta.vuln_flags.length > 0 ? (
                    <ul className="vuln-list">
                      {d._meta.vuln_flags.map((f, i) => (
                        <li key={i}>
                          {typeof f === "string" ? f : `${f.description} (${f.impact})`}
                        </li>
                      ))}
                    </ul>
                  ) : <span>-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="scan-page">
      <Sidebar />

      {/* === New Scan Section === */}
      <div className="scan-content">
        <h2>Network Vulnerability  Scanner (beta v.0)</h2>
        <p className="description">
          Trigger a live scan to identify connected devices and their potential vulnerabilities.
        </p>

        <button onClick={runScan} disabled={loading}>
          {loading ? "Scanning..." : "Run Network Scan"}
        </button>

        {loading && (
          <ul className="wave-menu">
            {Array.from({ length: 9 }).map((_, i) => <li key={i}></li>)}
          </ul>
        )}

        {error && <p className="error">{error}</p>}

        {rawResponse && (
          <details style={{ marginTop: 8 }}>
            <summary>Raw response (click to expand)</summary>
            <pre style={{ maxHeight: 300, overflow: "auto" }}>
              {JSON.stringify(rawResponse, null, 2)}
            </pre>
          </details>
        )}

        {devices.length > 0 && (
          <div className="current-scan-container">
            <h3>Current Scan Results</h3>
            {renderDeviceTable(devices)}
          </div>
        )}
      </div>

      {/* === Previous Scan (Sticky Bottom Container) === */}
      {/* Uncomment when ready to show previous results */}
      {/* {previousScan && !loading && (
        <div className="previous-scan-fixed">
          <div className="previous-scan-header">
            <h3>Previous Scan Results</h3>
            <p>
              Scanned at: {previousScan.scanned_at || previousScan.result?.scanned_at || "Unknown"} |{" "}
              Network: {previousScan.network || previousScan.result?.network || "N/A"} |{" "}
              Impact: <strong>{previousScan.overall_impact || "Info"}</strong>
            </p>
          </div>
          {renderDeviceTable(previousScan.hosts || previousScan.result?.hosts || [])}
        </div>
      )} */}
    </div>
  );
};

export default Scan;
