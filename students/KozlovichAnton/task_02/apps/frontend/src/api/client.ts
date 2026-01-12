import axios, { AxiosError, AxiosRequestConfig } from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

let getAccessToken: () => string | null = () => null;
let refreshAccess: () => Promise<string | null> = async () => null;
let onUnauthorized: () => Promise<void> | void = async () => {};

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true
});

export const plainApi = axios.create({
  baseURL: API_URL,
  withCredentials: true
});

export const configureApiAuth = (opts: {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
  onUnauthorized: () => Promise<void> | void;
}) => {
  getAccessToken = opts.getAccessToken;
  refreshAccess = opts.refresh;
  onUnauthorized = opts.onUnauthorized;
};

type RetriableConfig = AxiosRequestConfig & { _retry?: boolean };

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetriableConfig;

    if (status === 401 && !original._retry) {
      original._retry = true;
      const newToken = await refreshAccess();
      if (newToken) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      await onUnauthorized();
    }

    return Promise.reject(error);
  }
);

export const extractErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (err.message) return err.message;
  }
  return "Не удалось выполнить запрос";
};
