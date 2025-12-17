import React, { useEffect, useState } from "react";
import { apiGet } from "../../utils/api";
import "./profile.css";

function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await apiGet("/api/auth/me");
        const data = await res.json();

        if (!res.ok) {
          setError(data.message || "Failed to load profile");
          return;
        }

        setProfile(data);
      } catch (err) {
        setError("Something went wrong");
      }
    };

    loadProfile();
  }, []);

  return (
    <div className="page-wrapper">
      <div className="profile-container">
        <h2>My Profile</h2>

        {error && <div className="error-msg">{error}</div>}

        {!profile && !error && <p>Loading profile...</p>}

        {profile && (
          <>
            <div className="profile-row">
              <span>Name</span>
              <strong>{profile.name}</strong>
            </div>

            <div className="profile-row">
              <span>Email</span>
              <strong>{profile.email}</strong>
            </div>

            <div className="profile-row">
              <span>Role</span>
              <strong>{profile.role.toUpperCase()}</strong>
            </div>

            <div className="profile-row">
              <span>Status</span>
              <strong
                className={
                  profile.isActive ? "status-active" : "status-disabled"
                }
              >
                {profile.isActive ? "Active" : "Disabled"}
              </strong>
            </div>

            <div className="profile-row">
              <span>Last Login</span>
              <strong>
                {profile.lastLogin
                  ? new Date(profile.lastLogin).toLocaleString()
                  : "Never"}
              </strong>
            </div>

            <div className="profile-row">
              <span>Account Created</span>
              <strong>
                {new Date(profile.createdAt).toLocaleDateString()}
              </strong>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Profile;
