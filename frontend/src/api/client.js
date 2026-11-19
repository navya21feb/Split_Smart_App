import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('splitsmart_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthForm = error.config?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !isAuthForm) {
      localStorage.removeItem('splitsmart_token');
      localStorage.removeItem('splitsmart_user');
      window.location.reload(); // token expired: return to the login screen
    }
    return Promise.reject(error);
  }
);

export default api;
