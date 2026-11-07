// Thin fetch wrapper with bearer token and friendly errors.
let token = localStorage.getItem('rugo.token') || '';
export const getToken = () => token;
export function setToken(t) {
  token = t || '';
  if (t) localStorage.setItem('rugo.token', t);
  else localStorage.removeItem('rugo.token');
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Network problem — please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}
export const post = (path, body) => api(path, { method: 'POST', body: body || {} });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });
