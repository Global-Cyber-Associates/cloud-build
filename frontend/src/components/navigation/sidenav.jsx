import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Menu, X, LayoutDashboard, Monitor, Smartphone,
  Usb, Scan, ClipboardList, Star, ShieldCheck, Users,
  AlertTriangle, Download, LogOut, User as UserIcon, Settings, Key
} from "lucide-react";

import "./sidenav.css";
import Logo from "../../assets/gca.png";
import { getRole, logoutUser } from "../../utils/authService";

const Sidebar = ({ onToggle, isOpen: controlledIsOpen }) => {
  const [internalIsOpen, setInternalIsOpen] = useState(true);
  const navigate = useNavigate();

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const setIsOpen = (val) => {
    if (controlledIsOpen !== undefined) {
      if (onToggle) onToggle(val);
    } else {
      setInternalIsOpen(val);
      if (onToggle) onToggle(val);
    }
  };

  const role = getRole();
  const name = sessionStorage.getItem("name") || "User";
  const email = sessionStorage.getItem("email");

  const clientNavItems = [
    { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={20} /> },
    { label: "Visualizer", path: "/visualizer", icon: <Monitor size={20} /> },
    { label: "Devices", path: "/devices", icon: <Smartphone size={20} /> },
    { label: "USB Control", path: "/usb", icon: <Usb size={20} /> },
    { label: "Scanner", path: "/scan", icon: <Scan size={20} /> },
    { label: "Logs", path: "/logs", icon: <ClipboardList size={20} /> },
    { label: "Features", path: "/features", icon: <Star size={20} /> },
    { label: "Download", path: "/download", icon: <Download size={20} /> },
  ];

  const adminNavItems = [
    { label: "Admin Dashboard", path: "/admin/dashboard", icon: <ShieldCheck size={20} /> },
    { label: "Manage Users", path: "/admin/users", icon: <Users size={20} /> },
    { label: "License Manager", path: "/admin/licenses", icon: <Key size={20} /> },
    { label: "Download", path: "/download", icon: <Download size={20} /> },
  ];

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  useEffect(() => {
    if (onToggle) onToggle(isOpen);
  }, [isOpen, onToggle]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setIsOpen(false);
      else setIsOpen(true);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      {/* Toggle Button */}
      <button className="sidebar-toggle" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <aside className={`sidebar ${isOpen ? "open" : "closed"}`}>
        <div className="sidebar-top-section">
          {/* Logo */}
          <div className="sidebar-header">
            <img src={Logo} alt="GCA" className="sidebar-logo" />
            {isOpen && <h1 className="company-name">Global Cyber Associates</h1>}
          </div>

          {/* NAV LINKS */}
          <ul className="sidebar-nav">
            {(role === "admin" ? adminNavItems : clientNavItems).map((item, idx) => (
              <li key={idx}>
                <NavLink
                  to={item.path}
                  onClick={() => window.innerWidth < 1024 && setIsOpen(false)}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""} ${!isOpen ? "mini" : ""}`
                  }
                  title={!isOpen ? item.label : ""}
                  end
                >
                  <span className="nav-icon">{item.icon}</span>
                  {isOpen && <span className="nav-label">{item.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {/* ⭐ ACCOUNT SECTION (BOTTOM) */}
        <div className="sidebar-account-section">
          {isOpen && (
            <div className="account-info">
              <span className="account-name">{name}</span>
              <span className="account-email">{email}</span>
            </div>
          )}

          <ul className="sidebar-nav account-nav">
            <li>
              <NavLink
                to="/profile"
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""} ${!isOpen ? "mini" : ""}`}
                title={!isOpen ? "My Profile" : ""}
              >
                <span className="nav-icon"><UserIcon size={20} /></span>
                {isOpen && <span className="nav-label">My Profile</span>}
              </NavLink>
            </li>
            <li>
              <button className={`nav-link logout-btn ${!isOpen ? "mini" : ""}`} onClick={handleLogout} title={!isOpen ? "Logout" : ""}>
                <span className="nav-icon"><LogOut size={20} /></span>
                {isOpen && <span className="nav-label">Logout</span>}
              </button>
            </li>
          </ul>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
