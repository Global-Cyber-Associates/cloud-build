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

// AUTH & ADMIN
import Login from "./components/navigation/Login.jsx";
import CreateUser from "./components/admin/CreateUser.jsx";
import AdminDashboard from "./components/admin/AdminDashboard.jsx";
// import ManageUsers from "./components/admin/ManageUsers.jsx"; // create later

// PUBLIC PAGES
import Download from "./components/download/Download.jsx";

// TOKEN HELPERS
import { getToken, getRole } from "./utils/authService.js";

// ------------------------------------------------------
// 🔐 PROTECTED ROUTES
// ------------------------------------------------------

// Block access if no token
function ProtectedRoute({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
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

        {/* PUBLIC DOWNLOAD PAGE */}
        <Route path="/download" element={<Download />} />

        {/* USER DASHBOARD */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* ADMIN DASHBOARD */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            </ProtectedRoute>
          }
        />

        {/* ADMIN: MANAGE USERS */}
        {/* <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <ManageUsers />
              </AdminRoute>
            </ProtectedRoute>
          }
        /> */}

        {/* ADMIN: CREATE USER */}
        <Route
          path="/admin/create-user"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <CreateUser />
              </AdminRoute>
            </ProtectedRoute>
          }
        />

        {/* USER ROUTES */}
        <Route
          path="/visualizer"
          element={
            <ProtectedRoute>
              <Visualizer />
            </ProtectedRoute>
          }
        />

        <Route
          path="/devices"
          element={
            <ProtectedRoute>
              <Devices />
            </ProtectedRoute>
          }
        />

        <Route
          path="/devices/:id"
          element={
            <ProtectedRoute>
              <DeviceDetail />
            </ProtectedRoute>
          }
        />

        <Route
          path="/tasks/:id"
          element={
            <ProtectedRoute>
              <TaskManager />
            </ProtectedRoute>
          }
        />

        <Route
          path="/apps/:id"
          element={
            <ProtectedRoute>
              <InstalledApps />
            </ProtectedRoute>
          }
        />

        <Route
          path="/logs"
          element={
            <ProtectedRoute>
              <Logs />
            </ProtectedRoute>
          }
        />

        <Route
          path="/issues"
          element={
            <ProtectedRoute>
              <Issues />
            </ProtectedRoute>
          }
        />

        <Route
          path="/features"
          element={
            <ProtectedRoute>
              <Features />
            </ProtectedRoute>
          }
        />

        <Route
          path="/scan"
          element={
            <ProtectedRoute>
              <Scan />
            </ProtectedRoute>
          }
        />

        <Route
          path="/usb"
          element={
            <ProtectedRoute>
              <UsbControl />
            </ProtectedRoute>
          }
        />

        {/* DEFAULT REDIRECT */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
