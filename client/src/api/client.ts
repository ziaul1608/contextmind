import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const message =
        (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message ??
        error.message;
      console.error('[ContextMind API Error]', message);
    }
    return Promise.reject(error);
  },
);
