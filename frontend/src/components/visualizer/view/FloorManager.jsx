import React from "react";

export default function FloorManager({ floors, activeFloor, onAdd, onSwitch }) {
  return (
    <div className="floor-manager">
      {/* {floors.map((f) => (
        <button
          key={f.id}
          className={`floor-tab ${activeFloor === f.id ? "active" : ""}`}
          onClick={() => onSwitch(f.id)}
        >
          {f.name}
        </button>
      ))}
      <button className="add-floor-btn" onClick={onAdd}>
        ➕ Add Floor
      </button> */}
    </div>
  );
}
