const apiRequest = async (path, options = {}) => {
  const token = localStorage.getItem('pharmacy_token');
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
};

const queryString = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, value);
  });
  return search.toString();
};

export const api = {
  register: (body) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => apiRequest('/auth/me'),
  medicines: (params = {}) => apiRequest(`/medicines?${queryString(params)}`),
  medicine: (id) => apiRequest(`/medicines/${id}`),
  createMedicine: (body) => apiRequest('/medicines', { method: 'POST', body: JSON.stringify(body) }),
  updateMedicine: (id, body) => apiRequest(`/medicines/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteMedicine: (id) => apiRequest(`/medicines/${id}`, { method: 'DELETE' }),
  batches: (medicineId, params = {}) => apiRequest(`/medicines/${medicineId}/batches?${queryString(params)}`),
  createBatch: (medicineId, body) => apiRequest(`/medicines/${medicineId}/batches`, { method: 'POST', body: JSON.stringify(body) }),
  stock: (medicineId) => apiRequest(`/medicines/${medicineId}/stock`),
  dispense: (body) => apiRequest('/dispensing', { method: 'POST', body: JSON.stringify(body) }),
  expiring: (params = {}) => apiRequest(`/alerts/expiring?${queryString(params)}`),
  expired: (params = {}) => apiRequest(`/alerts/expired?${queryString(params)}`),
  dispensingHistory: (params = {}) => apiRequest(`/history/dispensing?${queryString(params)}`),
  stockHistory: (params = {}) => apiRequest(`/history/stock?${queryString(params)}`),
};
