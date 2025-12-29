import React, { useState, useEffect } from "react";
import { apiGet, apiPost } from "../../utils/api";
import { Users, Building2, CheckCircle, Clock, Smartphone } from "lucide-react";
import "./AdminDashboard.css";

function AdminDashboard() {
  const [requests, setRequests] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reqRes, tenRes] = await Promise.all([
        apiGet("/api/admin/requests"),
        apiGet("/api/admin/tenants")
      ]);

      if (reqRes.ok) setRequests(await reqRes.json());
      if (tenRes.ok) setTenants(await tenRes.json());
    } catch (err) {
      console.error("Failed to fetch admin data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm("Approve this client and create a new tenant?")) return;

    try {
      const res = await apiPost(`/api/admin/approve/${id}`);
      const data = await res.json();
      if (res.ok) {
        setMessage("Client approved successfully!");
        fetchData();
        setTimeout(() => setMessage(""), 3000);
      } else {
        alert(data.message || "Approval failed");
      }
    } catch (err) {
      alert("Error approving client");
    }
  };

  if (loading) return <div className="admin-dashboard-container"><div className="empty-state">Loading administration panel...</div></div>;

  return (
    <div className="admin-dashboard-container">
      <div className="admin-header">
        <h1>System Administration</h1>
        <p>Global multi-tenant management and approval center.</p>
      </div>

      {message && <div className="success-banner" style={{ background: '#2ecc71', color: '#fff', padding: '10px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>{message}</div>}

      {/* 1. PENDING REQUESTS */}
      <section className="admin-section">
        <h2><Clock size={20} color="#f39c12" /> Pending Registration Requests</h2>
        {requests.length === 0 ? (
          <div className="empty-state">No pending registration requests found.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Registration Name</th>
                <th>Email Address</th>
                <th>Company Name</th>
                <th>Date Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req._id}>
                  <td>{req.name}</td>
                  <td>{req.email}</td>
                  <td><strong>{req.companyName}</strong></td>
                  <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button className="btn-approve" onClick={() => handleApprove(req._id)}>
                      Approve & Create Tenant
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 2. ACTIVE TENANTS */}
      <section className="admin-section">
        <h2><Building2 size={20} color="#3498db" /> Active Client Tenants</h2>
        {tenants.length === 0 ? (
          <div className="empty-state">No active tenants yet.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Company/Tenant Name</th>
                <th>Owner Email</th>
                <th>Enrollment Key</th>
                <th>Total Devices</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((ten) => (
                <tr key={ten.id}>
                  <td><strong>{ten.name}</strong></td>
                  <td>{ten.ownerEmail}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{ten.enrollmentKey}</td>
                  <td>
                    <div className="stat-card-admin">
                      <Smartphone size={14} style={{ marginRight: '5px' }} />
                      {ten.deviceCount} Devices
                    </div>
                  </td>
                  <td>
                    <span className="badge-pending" style={{ background: ten.isActive ? '#2ecc71' : '#e74c3c' }}>
                      {ten.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-approve"
                      style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#3498db' }}
                      onClick={() => window.location.href = '/admin/licenses'}
                    >
                      Manage Licenses
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default AdminDashboard;
