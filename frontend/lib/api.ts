import axios from 'axios';

const baseURL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
  console.warn('NEXT_PUBLIC_API_BASE_URL no definido, usando http://localhost:4000');
}
console.log('API baseURL:', baseURL);

export const api = axios.create({
  baseURL,
});

export function setAuthToken(token: string) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && typeof window !== 'undefined') {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const res = await api.post('/auth/refresh', { refreshToken });
          const newToken = res.data.accessToken;
          const newRefresh = res.data.refreshToken;
          localStorage.setItem('token', newToken);
          localStorage.setItem('refreshToken', newRefresh);
          setAuthToken(newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
        }
      }
    }
    return Promise.reject(error);
  },
);
