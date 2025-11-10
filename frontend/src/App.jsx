import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import Login from "./components/login/login.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/visualizer" element={<Visualizer />} />
        <Route path="/login" element={<Login />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/devices/:id" element={<DeviceDetail />} />
        <Route path="/tasks/:id" element={<TaskManager />} />
        <Route path="/apps/:id" element={<InstalledApps />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/issues" element={<Issues />} />
        <Route path="/features" element={<Features />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/usb" element={<UsbControl />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
