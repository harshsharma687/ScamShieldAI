import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  API_BASE_URL,
  clearAccessToken,
  getApiError,
  refreshSession,
  setAccessToken,
} from "../services/api";
import {
  captureEvent,
  identifyUser,
  resetAnalytics,
} from "../services/analytics";
import { AuthContext } from "./authContext";

// React StrictMode mounts effects twice in development. The refresh endpoint
// rotates tokens, so the bootstrap refresh must run only once per page load.
let bootstrapPromise = null;

function bootstrapSession() {
  if (!bootstrapPromise) {
    bootstrapPromise = refreshSession().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    let mounted = true;

    bootstrapSession()
      .then((data) => {
        if (mounted) {
          setUser(data.user);
          setSessionError("");
        }
      })
      .catch((error) => {
        if (!mounted) return;

        clearAccessToken();
        setUser(null);

        // A 401 simply means there is no saved session, which is normal. Any
        // other failure (backend down, CORS, database down) is worth showing
        // on the sign-in screen instead of silently looking like a fresh user.
        if (error?.response?.status !== 401) {
          setSessionError(
            getApiError(
              error,
              `Cannot reach the backend at ${API_BASE_URL}. Start the API and try again.`
            )
          );
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const handleForcedLogout = () => {
      bootstrapPromise = null;
      clearAccessToken();
      setUser(null);
      resetAnalytics();
    };

    window.addEventListener("auth:logout", handleForcedLogout);

    return () => {
      mounted = false;
      window.removeEventListener("auth:logout", handleForcedLogout);
    };
  }, []);

  // Keeps the analytics identity in step with a session restored on reload.
  // Anonymous visitors are left alone so a pre-login replay keeps its session.
  useEffect(() => {
    if (user) identifyUser(user);
  }, [user]);

  const login = useCallback(async (credentials) => {
    const response = await api.auth.login(credentials);
    setAccessToken(response.data.data.accessToken);
    setUser(response.data.data.user);
    identifyUser(response.data.data.user);
    captureEvent("user_signed_in");
    return response.data.data.user;
  }, []);

  const register = useCallback(async (details) => {
    const response = await api.auth.register(details);
    setAccessToken(response.data.data.accessToken);
    setUser(response.data.data.user);
    identifyUser(response.data.data.user);
    captureEvent("user_signed_up");
    return response.data.data.user;
  }, []);

  const updateUser = useCallback((changes) => {
    setUser((current) => (current ? { ...current, ...changes } : current));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Even if the network is down, clear the local session.
    } finally {
      bootstrapPromise = null;
      clearAccessToken();
      setUser(null);
      captureEvent("user_signed_out");
      resetAnalytics();
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      sessionError,
      login,
      register,
      updateUser,
      logout,
    }),
    [user, loading, sessionError, login, register, updateUser, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
