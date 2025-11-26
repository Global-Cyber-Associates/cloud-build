import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import "./sidenav.css";

import Logo from "../../../public/gca.png";
import { getRole } from "../../utils/authService"; // ⭐ IMPORT ROLE

const Sidebar = ({ onToggle }) => {
  const [isOpen, setIsOpen] = useState(true);

  const role = getRole(); // ⭐ CHECK USER ROLE (admin/user)

  // ⭐ USER MENU ITEMS
  const userNavItems = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Visualizer", path: "/visualizer" },
    { label: "Devices", path: "/devices" },
    { label: "USB Control", path: "/usb" },
    { label: "Scanner", path: "/scan" },
    { label: "Logs", path: "/logs" },
    { label: "Features", path: "/features" },
  ];

  // ⭐ ADMIN MENU ITEMS
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

        <ul className="sidebar-nav">
          {/* ⭐ ADMIN MENU (ONLY IF ROLE === "admin") */}
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

          {/* ⭐ USER MENU (VISIBLE FOR BOTH admin + user) */}
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
      </aside>
    </>
  );
};

export default Sidebar;
