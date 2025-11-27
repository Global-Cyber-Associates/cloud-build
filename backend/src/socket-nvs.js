// backend/src/socket.js

let ioInstance = null;

// Called from server.js after creating the Socket.IO instance
export function initIO(io) {
  ioInstance = io;
}

// Used anywhere else in the backend to access the same IO instance
export function getIO() {
  if (!ioInstance) {
    throw new Error("Socket.IO not initialized. Call initIO() first in server.js");
  }
  return ioInstance;
}
