import { useState } from "react";
import { useAuth } from "../context/useAuth";
import { getApiError } from "../services/api";
import "./AuthGate.css";

/**
 * Sign-in / create-account form.
 *
 * It is shown as a dismissible modal after a guest tries to scan or open
 * private history, so visitors can explore the website before creating an
 * account. It uses the existing brown/beige design language.
 */
function AuthGate({ onClose, onAuthenticated, prompt }) {
  const {
    user,
    loading: sessionLoading,
    sessionError,
    login,
    register,
  } = useAuth();
  const isModal = Boolean(onClose);
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (sessionLoading) {
    return (
      <div className={`auth-gate ${isModal ? "auth-gate-modal" : ""}`}>
        <div className="auth-gate-card auth-loading">
          <div className="auth-shield">🛡️</div>
          <h1>ScamShield AI</h1>
          <p>Checking your secure session…</p>
        </div>
      </div>
    );
  }

  if (user) return null;

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setPassword("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (mode === "login") {
        await login({ email: email.trim(), password });
      } else {
        await register({ name: name.trim(), email: email.trim(), password });
      }

      if (onAuthenticated) {
        onAuthenticated();
      } else if (onClose) {
        onClose();
      }
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`auth-gate ${isModal ? "auth-gate-modal" : ""}`}>
      <div className="auth-gate-card">
        {onClose && (
          <button
            type="button"
            className="auth-close"
            onClick={onClose}
            aria-label="Close sign in"
          >
            ×
          </button>
        )}

        <div className="auth-brand">
          <div className="auth-shield">🛡️</div>
          <div>
            <h1>ScamShield AI</h1>
            <span>AI PROTECTION</span>
          </div>
        </div>

        <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p className="auth-subtitle">
          {mode === "login"
            ? prompt ||
              "Sign in to scan, save results and view your protection history."
            : "Create an account to scan, save results and keep your history private."}
        </p>

        {sessionError && (
          <p className="auth-error" role="alert">
            {sessionError}
          </p>
        )}

        <div className="auth-tabs" role="tablist" aria-label="Authentication">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => switchMode("register")}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                minLength={2}
                maxLength={80}
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              maxLength={191}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              maxLength={72}
              required
            />
          </label>

          {mode === "register" && (
            <small className="auth-hint">
              8–72 characters with at least one letter and one number.
            </small>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <p className="auth-note">
          🔒 Passwords are hashed and sessions use HTTP-only refresh cookies.
        </p>

        {onClose && (
          <button
            type="button"
            className="auth-guest-link"
            onClick={onClose}
          >
            Continue browsing as guest
          </button>
        )}
      </div>
    </div>
  );
}

export default AuthGate;
