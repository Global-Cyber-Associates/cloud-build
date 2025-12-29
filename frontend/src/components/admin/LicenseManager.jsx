import React, { useState, useEffect } from "react";
import { apiGet, apiPost } from "../../utils/api";
import {
    Shield,
    Search,
    Trash2,
    Monitor,
    Building2,
    Fingerprint,
    Activity,
    CheckCircle,
    Clock,
    Layout,
    Info,
    Zap
} from "lucide-react";
import "./LicenseManager.css";

function LicenseManager() {
    const [tenants, setTenants] = useState([]);
    const [selectedTenant, setSelectedTenant] = useState(null);
    const [agents, setAgents] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [seatInput, setSeatInput] = useState(5);
    const [toast, setToast] = useState("");

    useEffect(() => {
        fetchTenants();
    }, []);

    const fetchTenants = async () => {
        setLoading(true);
        try {
            const res = await apiGet("/api/admin/tenants");
            if (res.ok) {
                const data = await res.json();
                setTenants(data);
                if (data.length > 0 && !selectedTenant) {
                    handleSelectTenant(data[0]);
                }
            }
        } catch (err) {
            console.error("Failed to fetch tenants", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectTenant = async (tenant) => {
        setSelectedTenant(tenant);
        setSeatInput(tenant.maxSeats || 5);
        try {
            const res = await apiGet(`/api/admin/tenants/${tenant.id}/agents`);
            if (res.ok) {
                setAgents(await res.json());
            }
        } catch (err) {
            console.error("Failed to fetch agents", err);
        }
    };

    const handleUpdateSeats = async () => {
        if (!selectedTenant) return;
        try {
            const res = await apiPost(`/api/admin/tenants/${selectedTenant.id}/seats`, { maxSeats: seatInput });
            if (res.ok) {
                setToast("Infrastructure seat allocation updated successfully");
                const updatedTenants = tenants.map(t => t.id === selectedTenant.id ? { ...t, maxSeats: seatInput } : t);
                setTenants(updatedTenants);
                setSelectedTenant({ ...selectedTenant, maxSeats: seatInput });
                setTimeout(() => setToast(""), 4000);
            }
        } catch (err) {
            alert("Error updating seats");
        }
    };

    const handleDeactivate = async (agentId) => {
        if (!window.confirm("Are you sure you want to revoke this license? The endpoint will lose all elevated access.")) return;
        try {
            const res = await apiPost(`/api/admin/agents/${agentId}/deactivate`);
            if (res.ok) {
                setToast("License revoked successfully");
                handleSelectTenant(selectedTenant);
                setTimeout(() => setToast(""), 4000);
            }
        } catch (err) {
            alert("Error revoking license");
        }
    };

    const handleApprove = async (agentId) => {
        try {
            const res = await apiPost(`/api/admin/agents/${agentId}/approve`);
            if (res.ok) {
                setToast("License approved successfully");
                handleSelectTenant(selectedTenant);
                setTimeout(() => setToast(""), 4000);
            } else {
                const data = await res.json();
                alert(data.message || "Approval failed");
            }
        } catch (err) {
            alert("Error approving license");
        }
    };

    const filteredTenants = tenants.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeCount = agents.filter(a => a.isLicensed).length;

    return (
        <div className="license-manager-wrapper">
            {/* SIDEBAR: TENANT DISCOVERY */}
            <div className="license-sidebar">
                <div className="sidebar-header">
                    <h3>Infrastructure</h3>
                    <div className="search-box">
                        <Search size={18} color="#475569" />
                        <input
                            type="text"
                            placeholder="Filter tenants..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <div className="tenant-list">
                    {filteredTenants.map(t => (
                        <div
                            key={t.id}
                            className={`tenant-item ${selectedTenant?.id === t.id ? 'active' : ''}`}
                            onClick={() => handleSelectTenant(t)}
                        >
                            <div className="tenant-icon">
                                <Building2 size={20} />
                            </div>
                            <div className="tenant-info">
                                <span className="tenant-name">{t.name}</span>
                                <span className="tenant-key">{t.enrollmentKey.substring(0, 16).toUpperCase()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* VIEWPORT: LICENSE COMMAND CENTER */}
            <div className="license-content">
                {selectedTenant ? (
                    <>
                        <div className="content-header">
                            <div>
                                <h1>{selectedTenant.name}</h1>
                                <div className="header-badge">
                                    <Shield size={16} color="#3b82f6" />
                                    <span>Endpoint Guard Licensing & Provisioning</span>
                                </div>
                            </div>

                            <div className="seat-allocation">
                                <span className="seat-label">Seat Limit</span>
                                <div className="seat-input-group">
                                    <input
                                        type="number"
                                        min="1"
                                        value={seatInput}
                                        onChange={(e) => setSeatInput(Math.max(1, parseInt(e.target.value) || 1))}
                                    />
                                    <button className="btn-allocate" onClick={handleUpdateSeats}>Allocate Seats</button>
                                </div>
                            </div>
                        </div>

                        <div className="license-overview-grid">
                            <div className="overview-card blue">
                                <div className="card-icon"><Layout /></div>
                                <div>
                                    <span className="card-label">Registered Endpoints</span>
                                    <span className="card-value">{agents.length}</span>
                                </div>
                            </div>
                            <div className="overview-card green">
                                <div className="card-icon"><Activity /></div>
                                <div>
                                    <span className="card-label">Provisioned Seats</span>
                                    <span className="card-value">{activeCount} / {selectedTenant.maxSeats}</span>
                                    <div className="seat-progress-track">
                                        <div
                                            className="seat-progress-fill"
                                            style={{ width: `${Math.min(100, (activeCount / selectedTenant.maxSeats) * 100)}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                            <div className="overview-card orange">
                                <div className="card-icon"><Clock /></div>
                                <div>
                                    <span className="card-label">Pending Activation</span>
                                    <span className="card-value">{agents.length - activeCount}</span>
                                </div>
                            </div>
                        </div>

                        <div className="node-inventory-section">
                            <div className="section-title-row">
                                <h2>Node Inventory</h2>
                                <div className="header-badge">
                                    <Info size={14} /> Licensed nodes are uniquely bound to hardware fingerprints.
                                </div>
                            </div>

                            <div className="node-table-container">
                                <table className="node-table">
                                    <thead>
                                        <tr>
                                            <th>Identity & Network</th>
                                            <th>Hardware Binding</th>
                                            <th>Provisioning</th>
                                            <th>Last Sync</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {agents.map(a => (
                                            <tr key={a._id}>
                                                <td>
                                                    <div className="node-identity-cell">
                                                        <div className="node-avatar"><Monitor size={20} /></div>
                                                        <div className="node-main-info">
                                                            <span className="node-id">{a.agentId}</span>
                                                            <span className="node-meta">{a.ip || "0.0.0.0"}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="fingerprint-pill">
                                                        <Fingerprint size={12} style={{ marginRight: '8px' }} />
                                                        {a.fingerprint ? a.fingerprint.substring(0, 16).toUpperCase() : "UNBOUND"}
                                                    </div>
                                                </td>
                                                <td>
                                                    {a.isLicensed ? (
                                                        <div className="activation-status-badge status-active">
                                                            <div className="status-blob"></div> PROVISIONED
                                                        </div>
                                                    ) : (
                                                        <div className="activation-status-badge status-pending">
                                                            <div className="status-blob"></div> PENDING
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 500 }}>
                                                    {new Date(a.lastSeen).toLocaleString()}
                                                </td>
                                                <td>
                                                    {a.isLicensed ? (
                                                        <button className="btn-revoke" onClick={() => handleDeactivate(a._id)}>
                                                            <Trash2 size={16} /> Revoke
                                                        </button>
                                                    ) : (
                                                        <button className="btn-approve-node" onClick={() => handleApprove(a._id)}>
                                                            <Zap size={16} /> Approve
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="empty-view-container">
                        <div className="perspective-icon">
                            <Shield size={64} />
                        </div>
                        <h2>License Authority</h2>
                        <p>Select a verified infrastructure tenant to manage endpoint provisioning, hardware binding, and security seat allocations.</p>
                    </div>
                )}
            </div>

            {toast && (
                <div className="toast-container">
                    <CheckCircle size={20} />
                    {toast}
                </div>
            )}
        </div>
    );
}

export default LicenseManager;
