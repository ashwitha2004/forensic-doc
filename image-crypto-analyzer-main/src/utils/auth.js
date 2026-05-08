// ─── Auth token helpers ───────────────────────────────────────────────────────
// Uses sessionStorage — token is cleared when browser tab closes
// Never stored in localStorage for security

export const saveToken = (token) => {
  sessionStorage.setItem('pinit_token', token);
  localStorage.setItem('pinit_token', token); // ← ADD for dev
};

export const getToken = () => {
  return sessionStorage.getItem('pinit_token');
};

export const removeToken = () => {
  sessionStorage.removeItem('pinit_token');
  sessionStorage.removeItem('pinit_user');
  localStorage.removeItem('pinit_token');     // ← ADD for dev
};

export const saveUser = (user) => {
  sessionStorage.setItem('pinit_user', JSON.stringify(user));
};

export const getUser = () => {
  try {
    const u = sessionStorage.getItem('pinit_user');
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
};

export const isLoggedIn = () => {
  return !!sessionStorage.getItem('pinit_token');
};

export const isAdmin = () => {
  const user = getUser();
  return user?.role === 'admin';
};

export const logout = () => {
  removeToken();
  window.location.href = '/login';
};