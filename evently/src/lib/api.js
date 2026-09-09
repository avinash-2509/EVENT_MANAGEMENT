const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
export const API_BASE_URL = `${base}/api/v1`;

let accessToken = null;
let currentUser = null;
let restorePromise = null;

export const getCurrentUser = () => currentUser;
export const setSession = (payload) => {
  accessToken = payload?.accessToken || null;
  currentUser = payload?.user || null;
};

export const restoreSession = async () => {
  if (currentUser && accessToken) return currentUser;
  if (!restorePromise) {
    restorePromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('No active session');
        const body = await response.json();
        setSession(body.data);
        return currentUser;
      })
      .catch(() => {
        setSession(null);
        return null;
      })
      .finally(() => {
        restorePromise = null;
      });
  }
  return restorePromise;
};

export const apiFetch = async (path, options = {}, retry = true) => {
  if (!accessToken) await restoreSession();
  const headers = new Headers(options.headers || {});
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry) {
    accessToken = null;
    if (await restoreSession()) return apiFetch(path, options, false);
  }
  return response;
};

export const logout = async () => {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
  setSession(null);
};
