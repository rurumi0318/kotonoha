import { getToken } from './auth.js';

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
export const BASE_URL = isLocal
  ? 'http://localhost:8080'
  : 'https://kotonoha-backend-320300935118.asia-east1.run.app';

async function request(method, path, body) {
  const token = await getToken();
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, opts);

  if (res.status === 409) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.detail || 'Conflict');
    err.isConflict = true;
    err.status = 409;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  patch:  (path, body)  => request('PATCH',  path, body),
  put:    (path, body)  => request('PUT',    path, body),
  delete: (path)        => request('DELETE', path),
};

export const getPreferences    = ()     => request('GET', '/preferences');
export const updatePreferences = (data) => request('PUT', '/preferences', data);
