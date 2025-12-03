import React from "react";
import "./Download.css";

function Download() {
    const handleDownloadAdmin = () => {
        // Create a link element to trigger download for adminagent.exe
        const link = document.createElement("a");
        link.href = import.meta.env.VITE_ADMIN_AGENT_DOWNLOAD_URL || "/adminagent.exe";
        link.download = "adminagent.exe";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadUser = () => {
        // Create a link element to trigger download for useragent.exe
        const link = document.createElement("a");
        link.href = import.meta.env.VITE_USER_AGENT_DOWNLOAD_URL || "/useragent.exe";
        link.download = "useragent.exe";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="download-container">
            <div className="download-card">
                <div className="download-icon">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="80"
                        height="80"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </div>
                <h1>Download Agent Setup</h1>
                <p className="download-description">
                    Choose the appropriate agent installer for your role.
                </p>
                <div className="download-buttons">
                    <button className="download-button admin-button" onClick={handleDownloadAdmin}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        adminagent.exe
                    </button>

                    <button className="download-button user-button" onClick={handleDownloadUser}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        useragent.exe
                    </button>
                </div>

                <div className="download-info">
                    <p>
                        <strong>Note:</strong> Run the installer with administrator privileges
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Download;
