import { getToken } from "./authService";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export async function apiGet(path) {
  return fetch(`${BACKEND_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });
}

export async function apiPost(path, body) {
  return fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  });
}

export async function apiDelete(path) {
  return fetch(`${BACKEND_URL}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });
}

export async function apiPut(path, body) {
  return fetch(`${BACKEND_URL}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  });
}
