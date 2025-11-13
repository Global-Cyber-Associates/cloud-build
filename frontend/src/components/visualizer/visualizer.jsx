import React, { useState, useEffect } from "react";
import Sidebar from "../navigation/sidenav.jsx";
import FloorManager from "./view/FloorManager.jsx";
import FloorGrid from "./view/FloorGrid.jsx";
import socket, { fetchData } from "../../utils/socket.js";
import "./visualizer.css";

export default function Visualizer() {
  const [floors, setFloors] = useState([{ id: 1, name: "Floor 1", devices: [] }]);
  const [activeFloor, setActiveFloor] = useState(1);
  const [loading, setLoading] = useState(false);

  // ✅ Fetch devices via socket
  useEffect(() => {
    setLoading(true);

    fetchData("visualizer_data")
      .then((res) => {
        if (!res?.data || !Array.isArray(res.data)) return;

        const fetchedDevices = res.data.map((d, i) => ({
          id: i + 1,
          name: d.agentId || "Unknown", // ✅ always use agentId
          ip: d.ip || "N/A",
          mac: d.mac || "Unknown",
          noAgent: d.noAgent,
          icon: d.noAgent ? "⚠️" : "💻",
          x: (i % 6) * 120,
          y: Math.floor(i / 6) * 120,
        }));

        setFloors([{ id: 1, name: "Floor 1", devices: fetchedDevices }]);
      })
      .catch((err) => console.error("❌ Failed to fetch devices:", err))
      .finally(() => setLoading(false));

    // ✅ Fix for socket update overwriting agentId
    socket.on("visualizer_update", (deviceUpdate) => {
      setFloors((prev) =>
        prev.map((f) =>
          f.id === 1
            ? {
                ...f,
                devices: f.devices.map((d) =>
                  d.ip === deviceUpdate.ip
                    ? {
                        ...d,
                        ...deviceUpdate,
                        name: deviceUpdate.agentId || d.agentId || "Unknown", // 🔥 force agentId display
                      }
                    : d
                ),
              }
            : f
        )
      );
    });

    return () => {
      socket.off("visualizer_update");
    };
  }, []);

  const addFloor = () => {
    const newId = floors.length + 1;
    setFloors([...floors, { id: newId, name: `Floor ${newId}`, devices: [] }]);
    setActiveFloor(newId);
  };

  const updateFloorDevices = (floorId, devices) => {
    setFloors((prev) =>
      prev.map((f) => (f.id === floorId ? { ...f, devices } : f))
    );
  };

  return (
    <div className="visualizer-page">
      <Sidebar />
      <div className="visualizer-wrap">
        <div className="visualizer-header">
          <h1>Network Visualizer</h1>
          <FloorManager
            floors={floors}
            activeFloor={activeFloor}
            onAdd={addFloor}
            onSwitch={setActiveFloor}
          />
        </div>

        {loading ? (
          <div className="loading">Fetching devices...</div>
        ) : (
          <FloorGrid
            key={activeFloor}
            floor={floors.find((f) => f.id === activeFloor)}
            updateDevices={(devices) => updateFloorDevices(activeFloor, devices)}
          />
        )}
      </div>
    </div>
  );
}
