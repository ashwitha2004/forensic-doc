const BASE_URL = 'https://pinit-backend.onrender.com';
const getToken = () =>
  sessionStorage.getItem('pinit_token') ||
  localStorage.getItem('pinit_token')   ||
  localStorage.getItem('savedToken')    || '';

const clearToken = () => {
  sessionStorage.removeItem('pinit_token');
  localStorage.removeItem('pinit_token');
};

const request = async (method, endpoint, body = null, requiresAuth = true) => {
  const headers = { 'Content-Type': 'application/json' };
  if (requiresAuth) {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      throw new Error('Not authenticated');
    }
    headers['Authorization'] = `Bearer ${token}`;
  }
  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);
  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  // Auto-redirect on expired/invalid token
  if (response.status === 401 || response.status === 403) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Request failed');
  return data;
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  register   : (username, email, password) =>
    request('POST', '/auth/register', { username, email, password }, false),
  verifyOTP  : (email, code) =>
    request('POST', '/auth/verify-otp', { email, code }, false),
  resendOTP  : (email) =>
    request('POST', '/auth/resend-otp', { email }, false),
  login      : (email, password) =>
    request('POST', '/auth/login', { email, password }, false),
  adminLogin : (username, password) =>
    request('POST', '/auth/admin-login', { username, password }, false),
  changePassword: (new_password) =>
    request('POST', '/auth/change-password', { new_password }),
  getMe      : () => request('GET', '/auth/me'),
};

// ─── Vault ────────────────────────────────────────────────────────────────────
export const vaultAPI = {
  save        : (data)              => request('POST',   '/vault/save', data),
  list        : ()                  => request('GET',    '/vault/list'),
  getOne      : (id)                => request('GET',    `/vault/${id}`),
  delete      : (id)                => request('DELETE', `/vault/${id}`),
  verifyByHash: (hash)              => request('GET',    `/vault/verify/${hash}`, null, false),
  search      : (q)                 => request('GET',    `/vault/search/query?q=${encodeURIComponent(q)}`),
  visualSearch: (phash, threshold)  => request('POST',   '/vault/search/visual', { phash, threshold: threshold || 30 }),
  getByUUID   : (userId)  => request('GET',    `/vault/by-user/${encodeURIComponent(userId)}`),
};

// ─── Certificates ─────────────────────────────────────────────────────────────

export const certAPI = {
  save      : (data) => request('POST',   '/certificates/save', data),
  list      : ()     => request('GET',    '/certificates/list'),
  getOne    : (id)   => request('GET',    `/certificates/${id}`),
  getPublic : (id)   => request('GET',    `/certificates/public/${id}`, null, false),
  delete    : (id)   => request('DELETE', `/certificates/${id}`),
  share     : (data) => request('POST',   '/certificates/share', data),
};

// ─── Comparison ───────────────────────────────────────────────────────────────
export const compareAPI = {
  save      : (data)    => request('POST', '/compare/save', data),
  getHistory: ()        => request('GET',  '/compare/history'),
  getByAsset: (assetId) => request('GET',  `/compare/${assetId}`),
  getPublic : (token)   => request('GET',  `/compare/public/${token}`, null, false),
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminAPI = {
  getUsers    : ()               => request('GET',   '/admin/users'),
  getAllVault  : ()               => request('GET',   '/admin/vault'),
  getAllReports: ()               => request('GET',   '/admin/reports'),
  suspendUser : (id, reason)     => request('PATCH', `/admin/users/${id}/suspend`, { reason }),
  activateUser: (id)             => request('PATCH', `/admin/users/${id}/activate`),
  getAuditLog : ()               => request('GET',   '/admin/audit-log'),
  getStats    : ()               => request('GET',   '/admin/stats'),
};