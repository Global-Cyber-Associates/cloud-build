import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPut } from "../../utils/api";
import "./profile.css";

function ChangePassword() {
  const navigate = useNavigate();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      const res = await apiPut("/api/auth/change-password", {
        oldPassword,
        newPassword,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Failed to change password");
        return;
      }

      setMessage("Password changed successfully. Please login again.");

      // Logout after password change
      sessionStorage.clear();

      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err) {
      setError("Something went wrong");
    }
  };

  return (
    <div className="profile-container">
      <h2>Change Password</h2>

      {error && <div className="error-msg">{error}</div>}
      {message && <div className="success-msg">{message}</div>}

      <form onSubmit={handleSubmit} className="profile-form">
        <div className="form-group">
          <label>Old Password</label>
          <input
            type="password"
            value={oldPassword}
            required
            onChange={(e) => setOldPassword(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>New Password</label>
          <input
            type="password"
            value={newPassword}
            required
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="primary-btn">
          Update Password
        </button>
      </form>
    </div>
  );
}

export default ChangePassword;
