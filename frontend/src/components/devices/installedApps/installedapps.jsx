import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./installedapps.css";

const InstalledApps = () => {
  const { id: agentId } = useParams();
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState(null);

  useEffect(() => {
    if (!agentId) return;

    const fetchApps = async () => {
      try {
        const token = sessionStorage.getItem("token");
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/installed-apps/${agentId}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (!res.ok) throw new Error("Failed to fetch");
        
        const json = await res.json();
        if (json.success && json.data) {
           // Handle both single doc and aggregated structure if needed, but API returns single doc
           setApps(json.data.data?.apps || []);
        }
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchApps();
  }, [agentId]);

  const filteredApps = apps.filter((a) =>
    a.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="usb-control-container dark">
      <div className="usb-main">
        <div className="usb-header">
          <div className="header-left">
            <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
            <div className="header-text">
              <h1>Installed Applications</h1>
              <p>Agent ID: <span className="agent-id">{agentId}</span></p>
            </div>
          </div>
          <input
            type="text"
            placeholder="Search applications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="app-search"
          />
        </div>

        {loading ? (
          <div className="loading">Loading installed applications...</div>
        ) : !apps.length ? (
          <div className="no-data">No applications found for {agentId}.</div>
        ) : (
          <div className="table-wrapper">
            <table className="usb-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Version</th>
                  <th>Publisher</th>
                  <th>Install Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredApps.map((app, i) => (
                  <tr key={i} onClick={() => setSelectedApp(app)}>
                    <td className="tooltip-container">
                      {app.name || "Unknown"}
                      <span className="tooltip-text">{app.name || "Unknown"}</span>
                    </td>
                    <td>{app.version || "N/A"}</td>
                    <td className="tooltip-container">
                      {app.publisher || "—"}
                      <span className="tooltip-text">{app.publisher || "—"}</span>
                    </td>
                    <td>
                      {app.install_date
                        ? new Date(
                            app.install_date.length === 8
                              ? `${app.install_date.slice(0, 4)}-${app.install_date.slice(4, 6)}-${app.install_date.slice(6, 8)}`
                              : app.install_date
                          ).toLocaleDateString()
                        : "Unknown"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedApp && (
          <div className="app-modal">
            <div className="modal-content">
              <h2>{selectedApp.name}</h2>
              <div className="modal-body">
                <p><b>Version:</b> {selectedApp.version || "N/A"}</p>
                <p><b>Publisher:</b> {selectedApp.publisher || "—"}</p>
                <p><b>Install Date:</b>{" "}
                  {selectedApp.install_date
                    ? new Date(
                        selectedApp.install_date.length === 8
                          ? `${selectedApp.install_date.slice(0, 4)}-${selectedApp.install_date.slice(4, 6)}-${selectedApp.install_date.slice(6, 8)}`
                          : selectedApp.install_date
                      ).toLocaleDateString()
                    : "Unknown"}
                </p>
                <p><b>Registry Key:</b> <span className="long-text">{selectedApp.registry_key || "N/A"}</span></p>
                <p><b>Install Location:</b> <span className="long-text">{selectedApp.install_location || "Unknown"}</span></p>
                <p><b>Uninstall String:</b> <span className="long-text">{selectedApp.uninstall_string || "N/A"}</span></p>
              </div>
              <button className="close-btn" onClick={() => setSelectedApp(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstalledApps;
