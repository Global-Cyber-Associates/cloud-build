// frontend/src/components/navigation/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../../utils/authService";
import logo from "../../assets/gca.png";
import "./login.css";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const res = await loginUser(email, password);

    if (res.token) {
      const role = sessionStorage.getItem("role");

      if (role === "admin") navigate("/admin/dashboard");
      else navigate("/dashboard");
    } else {
      setError(res.message || "Login failed");
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <img src={logo} alt="GCA Logo" className="login-logo" />

        <h2 className="login-title">VisuN</h2>
        <h4 className="login-title2"> @ powered by AI</h4>
        <p className="login-subtitle">Please login to continue</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="login-btn">
            Login
          </button>

          {/* <div className="download-section">
            <button
              type="button"
              className="download-link-btn"
              onClick={() => navigate("/download")}
            >
              Download Agent
            </button>
          </div> */}
        </form>
      </div>
      <div className="login-footer">© 2025 Global Cyber Associates</div>
    </div>
  );
}

export default Login;
