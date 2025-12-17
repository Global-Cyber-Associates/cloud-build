import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, X, LogOut } from "lucide-react";

import "./sidenav.css";
import Logo from "../../assets/gca.png";
import { getRole, logoutUser } from "../../utils/authService";

const Sidebar = ({ onToggle }) => {
  const [isOpen, setIsOpen] = useState(true);
  const navigate = useNavigate();
  const name = sessionStorage.getItem("name");
  const email = sessionStorage.getItem("email");

  const role = getRole(); // admin / user

  // USER MENU
  const userNavItems = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Visualizer", path: "/visualizer" },
    { label: "Devices", path: "/devices" },
    { label: "USB Control", path: "/usb" },
    { label: "Scanner", path: "/scan" },
    { label: "Logs", path: "/logs" },
    { label: "Features", path: "/features" },
    { label: "Change Password", path: "/profile/change-password" },
    { label: "My Profile", path: "/profile" },
  ];

  // ADMIN MENU
  const adminNavItems = [
    { label: "Admin Dashboard", path: "/admin/dashboard" },
    { label: "Manage Users", path: "/admin/users" },
  ];

  useEffect(() => {
    if (onToggle) onToggle(isOpen);
  }, [isOpen, onToggle]);

  // Responsive collapse
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setIsOpen(false);
      else setIsOpen(true);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // LOGOUT HANDLER
  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  return (
    <>
      {/* Toggle Button */}
      <button className="sidebar-toggle" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <aside className={`sidebar ${isOpen ? "open" : "closed"}`}>
        {/* Logo */}
        <div className="sidebar-header">
          <img
            src={Logo}
            alt="Global Cyber Associates"
            className="sidebar-logo"
          />
          <h1 className="company-name">Global Cyber Associates</h1>
        </div>

        {/* NAV LINKS */}
        <ul className="sidebar-nav">
          {/* ADMIN LINKS */}
          {role === "admin" &&
            adminNavItems.map((item, idx) => (
              <li key={idx}>
                <NavLink
                  to={item.path}
                  onClick={() => window.innerWidth < 768 && setIsOpen(false)}
                  className={({ isActive }) =>
                    isActive ? "nav-link active" : "nav-link"
                  }
                  end
                >
                  {item.label}
                </NavLink>
              </li>
            ))}

          {/* USER LINKS */}
          {userNavItems.map((item, idx) => (
            <li key={idx}>
              <NavLink
                to={item.path}
                onClick={() => window.innerWidth < 768 && setIsOpen(false)}
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
                end
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        {/* CURRENT USER INFO */}
        <div className="sidebar-user">
          <div className="user-name">{name || "Unknown User"}</div>
          <div className="user-email">{email}</div>
          <div className="user-role">{role?.toUpperCase()}</div>
        </div>

        {/* LOGOUT AT BOTTOM */}
        <div className="sidebar-logout">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
