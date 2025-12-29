// frontend/src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// USER PAGES
import Dashboard from "./components/dashboard/dashboard.jsx";
import Visualizer from "./components/visualizer/visualizer.jsx";
import Devices from "./components/devices/devices.jsx";
import DeviceDetail from "./components/devices/deviceControl.jsx/deviceControl.jsx";
import Logs from "./components/Logs/logs.jsx";
import Issues from "./components/issues/issues.jsx";
import Features from "./components/Features/features.jsx";
import Scan from "./components/scan/scan.jsx";
import TaskManager from "./components/devices/Taskmanager/taskmanager.jsx";
import UsbControl from "./components/usb/usb.jsx";
import InstalledApps from "./components/devices/installedApps/installedapps.jsx";
import ChangePassword from "./components/profile/ChangePassword.jsx";
import Profile from "./components/profile/Profile.jsx";

// AUTH & ADMIN
import Login from "./components/navigation/Login.jsx";
import Register from "./components/navigation/Register.jsx";
import CreateUser from "./components/admin/CreateUser.jsx";
import AdminDashboard from "./components/admin/AdminDashboard.jsx";
import ManageUsers from "./components/admin/ManageUsers.jsx";
import LicenseManager from "./components/admin/LicenseManager.jsx";
// import ManageUsers from "./components/admin/ManageUsers.jsx"; // create later

// PUBLIC PAGES
import Download from "./components/download/Download.jsx";

// TOKEN HELPERS
import { getToken, getRole } from "./utils/authService.js";

// LAYOUT WRAPPER
import Layout from "./components/navigation/Layout.jsx";

// ------------------------------------------------------
// 🔐 PROTECTED ROUTES
// ------------------------------------------------------

// Block access if no token
function ProtectedRoute({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

// Full Layout with Sidebar and TopNav
function ProtectedLayout({ children, adminOnly = false }) {
  const content = adminOnly ? (
    <AdminRoute>{children}</AdminRoute>
  ) : (
    children
  );

  return (
    <ProtectedRoute>
      <Layout>{content}</Layout>
    </ProtectedRoute>
  );
}

// Block access if not admin
function AdminRoute({ children }) {
  return getRole() === "admin" ? (
    children
  ) : (
    <Navigate to="/dashboard" replace />
  );
}

// ------------------------------------------------------
// 🌐 MAIN APP ROUTER
// ------------------------------------------------------
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* LOGIN */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* PROTECTED DOWNLOAD PAGE */}
        <Route
          path="/download"
          element={
            <ProtectedLayout>
              <Download />
            </ProtectedLayout>
          }
        />
        {/* USER DASHBOARD */}
        <Route
          path="/dashboard"
          element={
            <ProtectedLayout>
              <Dashboard />
            </ProtectedLayout>
          }
        />
        {/* ADMIN DASHBOARD */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedLayout adminOnly={true}>
              <AdminDashboard />
            </ProtectedLayout>
          }
        />
        {/* ADMIN: MANAGE USERS */}
        <Route
          path="/admin/users"
          element={
            <ProtectedLayout adminOnly={true}>
              <ManageUsers />
            </ProtectedLayout>
          }
        />
        {/* ADMIN: CREATE USER */}
        <Route
          path="/admin/create-user"
          element={
            <ProtectedLayout adminOnly={true}>
              <CreateUser />
            </ProtectedLayout>
          }
        />
        {/* ADMIN: LICENSE MANAGER */}
        <Route
          path="/admin/licenses"
          element={
            <ProtectedLayout adminOnly={true}>
              <LicenseManager />
            </ProtectedLayout>
          }
        />
        {/* USER ROUTES */}
        <Route
          path="/visualizer"
          element={
            <ProtectedLayout>
              <Visualizer />
            </ProtectedLayout>
          }
        />

        <Route
          path="/profile/change-password"
          element={
            <ProtectedLayout>
              <ChangePassword />
            </ProtectedLayout>
          }
        />

        <Route
          path="/devices"
          element={
            <ProtectedLayout>
              <Devices />
            </ProtectedLayout>
          }
        />
        <Route
          path="/devices/:id"
          element={
            <ProtectedLayout>
              <DeviceDetail />
            </ProtectedLayout>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <ProtectedLayout>
              <TaskManager />
            </ProtectedLayout>
          }
        />
        <Route
          path="/apps/:id"
          element={
            <ProtectedLayout>
              <InstalledApps />
            </ProtectedLayout>
          }
        />
        <Route
          path="/logs"
          element={
            <ProtectedLayout>
              <Logs />
            </ProtectedLayout>
          }
        />

        <Route
          path="/features"
          element={
            <ProtectedLayout>
              <Features />
            </ProtectedLayout>
          }
        />
        <Route
          path="/scan"
          element={
            <ProtectedLayout>
              <Scan />
            </ProtectedLayout>
          }
        />
        <Route
          path="/usb"
          element={
            <ProtectedLayout>
              <UsbControl />
            </ProtectedLayout>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedLayout>
              <Profile />
            </ProtectedLayout>
          }
        />

        {/* DEFAULT REDIRECT */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
