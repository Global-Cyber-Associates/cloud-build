import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import socket from "../../../utils/socket";
import "./taskmanager.css";

const TaskManager = () => {
  const { id } = useParams(); // /tasks/:id
  const [tasks, setTasks] = useState({ applications: [], background_processes: [] });
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) {
      setError("No agent ID specified in URL.");
      setLoading(false);
      return;
    }

    // 🔹 Initial fetch via API (Secure)
    const fetchTasks = async () => {
      try {
        const token = sessionStorage.getItem("token");
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/task-manager/${id}`, {
             headers: { "Authorization": `Bearer ${token}` }
        });

        const res = await response.json();
        console.log("🔍 Initial Task Info (API):", res);

        if (!res?.success || !res?.data?.length) {
            setError(`No task info received for ${id}`);
            setLoading(false);
            return;
        }

        const doc = res.data[0];

        setDevice({
            hostname: doc.device?.hostname || `Agent ${doc.agentId}`,
            os_type: doc.device?.os_type || "Unknown OS",
            os_version: doc.device?.os_version || "",
            machine_id: doc.agentId,
        });

        setTasks({
            applications: doc.data.applications || [],
            background_processes: doc.data.background_processes || [],
        });

      } catch (e) {
        console.error("API error:", e);
        setError("Failed to fetch task info.");
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();

    // 🔹 Listen for live task updates
    socket.on("task_info_update", (update) => {
      if (update.agentId === id) {
        console.log("⚡ Live update received:", update);

        setTasks({
          applications: update.data.applications || [],
          background_processes: update.data.background_processes || [],
        });
      }
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      setError("Failed to connect to real-time service.");
      setLoading(false);
    });

    return () => {
      socket.off("connect_error");
      socket.off("task_info_update");
    };
  }, [id]);

  if (loading) return <div className="pc-container">Loading Task Manager...</div>;
  if (error) return <div className="pc-container">{error}</div>;

  return (
    <div className="pc-container">
      <div className="task-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate("/devices")}>
            ← Back
          </button>
          <div>
            <h1 className="task-title">Task Manager</h1>
            <p className="task-sub">{device?.hostname}</p>
          </div>
        </div>
        <div className="header-right">
          <p>
            <strong>OS:</strong> {device?.os_type} {device?.os_version}
          </p>
          <p>
            <strong>ID:</strong> {device?.machine_id}
          </p>
        </div>
      </div>

      {/* Applications */}
      <div className="pc-section">
        <div className="section-header">
          <h2>🖥️ Applications</h2>
        </div>
        <div className="table">
          <div className="table-header sticky">
            <span>Name</span>
            <span>PID</span>
            <span>CPU</span>
            <span>Memory</span>
          </div>
          <div className="table-body">
            {tasks.applications.length ? (
              tasks.applications.map((app) => (
                <div key={app.pid + app.name} className="task-row">
                  <span className="task-name">
                    {app.name} {app.title ? `- ${app.title}` : ""}
                  </span>
                  <span>{app.pid}</span>
                  <span>{app.cpu_percent}%</span>
                  <span>{app.memory_percent}%</span>
                </div>
              ))
            ) : (
              <p className="empty">No applications running.</p>
            )}
          </div>
        </div>
      </div>

      {/* Background Processes */}
      <div className="pc-section">
        <div className="section-header">
          <h2>🧩 Background Processes</h2>
        </div>
        <div className="table">
          <div className="table-header sticky">
            <span>Name</span>
            <span>PID</span>
            <span>CPU</span>
            <span>Memory</span>
          </div>
          <div className="table-body">
            {tasks.background_processes.length ? (
              tasks.background_processes.map((proc) => (
                <div key={proc.pid + proc.name} className="task-row">
                  <span className="task-name">{proc.name}</span>
                  <span>{proc.pid}</span>
                  <span>{proc.cpu_percent}%</span>
                  <span>{proc.memory_percent}%</span>
                </div>
              ))
            ) : (
              <p className="empty">No background processes.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskManager;
