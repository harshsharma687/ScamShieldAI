import axios from "axios";

/**
 * One axios instance for the whole frontend.
 *
 * The short-lived access token is kept in memory only. The refresh token is an
 * HTTP-only cookie, so a page reload silently restores the session without
 * exposing a long-lived token to JavaScript.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:5000/api";

// The API origin without the trailing /api, used to turn a server path such as
// /api/avatars/abc.webp into a URL an <img>/background-image can load.
const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");

export function resolveAssetUrl(value) {
  if (!value) return "";

  const text = String(value).trim();

  if (!text) return "";
  if (/^(https?:|data:|blob:)/i.test(text)) return text;

  return `${API_ORIGIN}${text.startsWith("/") ? "" : "/"}${text}`;
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 60000,
});

let accessToken = null;
let refreshPromise = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function clearAccessToken() {
  accessToken = null;
}

export function getAccessToken() {
  return accessToken;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

export async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = apiClient
      // Don't leave the login gate spinning for a minute when the backend is
      // down. A slow database usually answers well before this.
      .post("/auth/refresh", null, { timeout: 12000 })
      .then((response) => {
        setAccessToken(response.data.data.accessToken);
        return response.data.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || "";
    const isAuthCall =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/logout");

    if (status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;

      try {
        await refreshSession();
        return apiClient(original);
      } catch {
        clearAccessToken();
        window.dispatchEvent(new Event("auth:logout"));
      }
    }

    return Promise.reject(error);
  }
);

function uploadImage(file) {
  const formData = new FormData();
  formData.append("image", file);

  return apiClient.post("/scans/image", formData, {
    // Image analysis can take longer than a JSON request.
    timeout: 120000,
  });
}

export const api = {
  auth: {
    register: (payload) => apiClient.post("/auth/register", payload),
    login: (payload) => apiClient.post("/auth/login", payload),
    logout: () => apiClient.post("/auth/logout"),
    me: () => apiClient.get("/auth/me"),
    refresh: () => apiClient.post("/auth/refresh"),
  },
  dashboard: {
    stats: () => apiClient.get("/dashboard/stats"),
    recentScans: (limit = 5) =>
      apiClient.get("/dashboard/recent-scans", { params: { limit } }),
  },
  scans: {
    image: uploadImage,
    link: (url) => apiClient.post("/scans/link", { url }),
    message: (message) => apiClient.post("/scans/message", { message }),
    get: (id) => apiClient.get(`/scans/${id}`),
    // The image route is authenticated, so an <img src> cannot load it. The
    // bytes are fetched with the token and shown from a temporary blob URL.
    file: (id) =>
      apiClient.get(`/scans/${id}/file`, { responseType: "blob" }),
  },
  history: {
    list: (params = {}) => apiClient.get("/history", { params }),
    get: (id) => apiClient.get(`/history/${id}`),
    remove: (id) => apiClient.delete(`/history/${id}`),
    clear: () => apiClient.delete("/history"),
  },
  settings: {
    profile: () => apiClient.get("/settings/profile"),
    updateProfile: (payload) => apiClient.put("/settings/profile", payload),
    changePassword: (payload) =>
      apiClient.put("/settings/change-password", payload),
    deleteAccount: (password) =>
      apiClient.delete("/settings/account", { data: { password } }),
    uploadAvatar: (file) => {
      const formData = new FormData();
      formData.append("avatar", file);

      return apiClient.post("/settings/avatar", formData, { timeout: 30000 });
    },
    removeAvatar: () => apiClient.delete("/settings/avatar"),
    sessions: () => apiClient.get("/settings/sessions"),
    revokeSession: (id) => apiClient.delete(`/settings/sessions/${id}`),
    revokeOtherSessions: () => apiClient.delete("/settings/sessions"),
    exportData: () =>
      apiClient.get("/settings/export", { timeout: 30000 }),
  },
};

/** Turns an axios error into a message that is safe to show in the UI. */
export function getApiError(error, fallback = "Something went wrong. Please try again.") {
  const response = error?.response?.data;

  if (response?.errors?.length) {
    return response.errors[0].message || response.message || fallback;
  }

  if (response?.message) return response.message;

  if (!error?.response) {
    if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
      return "The backend took too long to respond. Check that the API and MySQL are running, then try again.";
    }

    return `Cannot reach the backend at ${API_BASE_URL}. Start it with "npm run dev:demo" in the backend folder, then try again.`;
  }

  return error?.message || fallback;
}

export function notifyScanUpdated() {
  window.dispatchEvent(new Event("scan-history-updated"));
}

export default apiClient;
