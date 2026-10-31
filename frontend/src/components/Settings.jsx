import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import {
  api,
  getApiError,
  notifyScanUpdated,
  resolveAssetUrl,
} from "../services/api";
import { formatDate } from "../utils/format";
import "./Settings.css";

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

function initials(name) {
  return String(name || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function Notice({ notice }) {
  if (!notice) return null;

  return (
    <p className={`settings-notice ${notice.type}`} role="status">
      {notice.text}
    </p>
  );
}

/** Saves a JSON object as a file without touching the server. */
function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function Settings() {
  const { user, updateUser, logout } = useAuth();

  const [profile, setProfile] = useState(user);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState(null);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState(null);
  const avatarInputRef = useRef(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState(null);

  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [sessionsNotice, setSessionsNotice] = useState(null);

  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [dataNotice, setDataNotice] = useState(null);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState(null);

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  function applyUser(freshUser) {
    setProfile(freshUser);
    setName(freshUser.name || "");
    setEmail(freshUser.email || "");
    updateUser(freshUser);
  }

  async function loadSessions() {
    try {
      const response = await api.settings.sessions();
      setSessions(response.data.data.sessions || []);
    } catch {
      // The rest of the page still works if session listing fails.
    } finally {
      setSessionsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      const [profileResult, statsResult, sessionsResult] =
        await Promise.allSettled([
          api.settings.profile(),
          api.dashboard.stats(),
          api.settings.sessions(),
        ]);

      if (!active) return;

      if (sessionsResult.status === "fulfilled") {
        setSessions(sessionsResult.value.data.data.sessions || []);
      }

      setSessionsLoading(false);

      if (profileResult.status === "fulfilled") {
        const freshUser = profileResult.value.data.data.user;

        setProfile(freshUser);
        setName(freshUser.name || "");
        setEmail(freshUser.email || "");
        updateUser(freshUser);
      }

      if (statsResult.status === "fulfilled") {
        setStats(statsResult.value.data.data);
      }

      setLoading(false);
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, [updateUser]);

  if (!user) return null;

  const emailChanged =
    email.trim().toLowerCase() !== String(profile?.email || "").toLowerCase();
  const imageUrl = resolveAssetUrl(profile?.profileImage);
  const hasImage = Boolean(imageUrl);
  const otherSessions = sessions.filter((session) => !session.current);

  async function refreshProfile() {
    try {
      const response = await api.settings.profile();
      applyUser(response.data.data.user);
    } catch {
      // Keep the existing form values if the follow-up refresh fails.
    }
  }

  function openAvatarPicker() {
    if (avatarBusy) return;
    avatarInputRef.current?.click();
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setAvatarNotice(null);

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setAvatarNotice({
        type: "error",
        text: "Choose a JPG or PNG image for your profile photo.",
      });
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarNotice({
        type: "error",
        text: "That photo is larger than 10 MB. Pick a smaller image.",
      });
      return;
    }

    setAvatarBusy(true);

    try {
      const response = await api.settings.uploadAvatar(file);
      applyUser(response.data.data.user);
      setAvatarNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setAvatarNotice({
        type: "error",
        text: getApiError(error, "Your photo could not be uploaded."),
      });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarNotice(null);
    setAvatarBusy(true);

    try {
      const response = await api.settings.removeAvatar();
      applyUser(response.data.data.user);
      setAvatarNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setAvatarNotice({
        type: "error",
        text: getApiError(error, "Your photo could not be removed."),
      });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileNotice(null);

    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      setProfileNotice({
        type: "error",
        text: "Name must be at least 2 characters long.",
      });
      return;
    }

    if (emailChanged && !profilePassword) {
      setProfileNotice({
        type: "error",
        text: "Enter your current password to change your email address.",
      });
      return;
    }

    const payload = { name: trimmedName };

    if (emailChanged) {
      payload.email = email.trim().toLowerCase();
      payload.currentPassword = profilePassword;
    }

    setProfileSaving(true);

    try {
      const response = await api.settings.updateProfile(payload);
      const updatedUser = response.data.data.user;

      applyUser(updatedUser);
      setProfilePassword("");
      setProfileNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setProfileNotice({
        type: "error",
        text: getApiError(error, "Your profile could not be updated."),
      });

      // Some profile fields can be saved before a later email-delivery error.
      // Re-read the server copy so the form does not show stale values.
      await refreshProfile();
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordNotice(null);

    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: "error", text: "New passwords do not match." });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordNotice({
        type: "error",
        text: "New password must be at least 8 characters long.",
      });
      return;
    }

    setPasswordSaving(true);

    try {
      const response = await api.settings.changePassword({
        currentPassword,
        newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice({
        type: "success",
        text: `${response.data.message} Use the new password the next time you sign in.`,
      });

      loadSessions();
    } catch (error) {
      setPasswordNotice({
        type: "error",
        text: getApiError(error, "Your password could not be changed."),
      });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleRevokeSession(session) {
    setSessionsNotice(null);
    setRevokingId(session.id);

    try {
      const response = await api.settings.revokeSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      setSessionsNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setSessionsNotice({
        type: "error",
        text: getApiError(error, "That device could not be signed out."),
      });
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeOtherSessions() {
    setSessionsNotice(null);

    try {
      const response = await api.settings.revokeOtherSessions();
      setSessionsNotice({ type: "success", text: response.data.message });
      await loadSessions();
    } catch (error) {
      setSessionsNotice({
        type: "error",
        text: getApiError(error, "Other devices could not be signed out."),
      });
    }
  }

  async function handleExport() {
    setDataNotice(null);
    setExporting(true);

    try {
      const response = await api.settings.exportData();
      const payload = response.data.data;
      const date = new Date(payload.exportedAt || Date.now())
        .toISOString()
        .slice(0, 10);

      downloadJson(payload, `scamshield-data-${date}.json`);
      setDataNotice({
        type: "success",
        text: `Exported ${payload.scanCount} scan${payload.scanCount === 1 ? "" : "s"} to your downloads folder.`,
      });
    } catch (error) {
      setDataNotice({
        type: "error",
        text: getApiError(error, "Your data could not be exported."),
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleClearHistory() {
    const confirmed = window.confirm(
      "Delete every scan and uploaded image from your history? Your account stays active. This cannot be undone."
    );

    if (!confirmed) return;

    setDataNotice(null);
    setClearing(true);

    try {
      const cleared = await api.history.clear();
      notifyScanUpdated();

      try {
        const statsResponse = await api.dashboard.stats();
        setStats(statsResponse.data.data);
      } catch {
        setStats((current) =>
          current
            ? {
                ...current,
                totalScans: 0,
                safeItems: 0,
                suspiciousItems: 0,
                filesUploaded: 0,
              }
            : current
        );
      }

      setDataNotice({
        type: "success",
        text: cleared.data.message || "Scan history deleted.",
      });
    } catch (error) {
      setDataNotice({
        type: "error",
        text: getApiError(error, "Your scan history could not be cleared."),
      });
    } finally {
      setClearing(false);
    }
  }

  async function handleDeleteSubmit(event) {
    event.preventDefault();
    setDeleteNotice(null);

    if (!deletePassword) {
      setDeleteNotice({
        type: "error",
        text: "Enter your password to delete your account.",
      });
      return;
    }

    if (!deleteConfirmed) {
      setDeleteNotice({
        type: "error",
        text: "Tick the confirmation box before deleting your account.",
      });
      return;
    }

    setDeleting(true);

    try {
      await api.settings.deleteAccount(deletePassword);
      await logout();
    } catch (error) {
      setDeleteNotice({
        type: "error",
        text: getApiError(error, "Your account could not be deleted."),
      });
      setDeleting(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-heading">
        <div>
          <span className="settings-label">ACCOUNT PREFERENCES</span>
          <h2>Settings</h2>
          <p>
            Manage your profile, photo, password, sessions and your data.
          </p>
        </div>
        <div className="settings-icon">⚙️</div>
      </div>

      <section className="settings-hero">
        <div className="settings-identity">
          <button
            type="button"
            className={`settings-avatar${hasImage ? " has-image" : ""}`}
            style={hasImage ? { backgroundImage: `url("${imageUrl}")` } : undefined}
            onClick={openAvatarPicker}
            disabled={avatarBusy}
            aria-label="Change profile photo"
          >
            {!hasImage && initials(profile?.name || user.name)}
            <span className="settings-avatar-overlay">
              {avatarBusy ? "…" : "Change"}
            </span>
          </button>

          <div className="settings-avatar-links">
            <button type="button" onClick={openAvatarPicker} disabled={avatarBusy}>
              {hasImage ? "Replace photo" : "Upload photo"}
            </button>
            {hasImage && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={avatarBusy}
              >
                Remove
              </button>
            )}
          </div>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="settings-avatar-input"
            onChange={handleAvatarChange}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>

        <div className="settings-hero-copy">
          <h3>{profile?.name || user.name}</h3>
          <p>{profile?.email || user.email}</p>
          <span>
            Member since {loading ? "…" : formatDate(profile?.createdAt)}
          </span>
        </div>

        <div className="settings-snapshot">
          <div>
            <strong>{loading ? "…" : stats?.totalScans ?? 0}</strong>
            <span>Total scans</span>
          </div>
          <div>
            <strong>{loading ? "…" : stats?.suspiciousItems ?? 0}</strong>
            <span>Suspicious</span>
          </div>
          <div>
            <strong>{loading ? "…" : stats?.safeItems ?? 0}</strong>
            <span>Safe</span>
          </div>
        </div>
      </section>

      <Notice notice={avatarNotice} />

      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-card-heading">
            <div>
              <h3>Profile details</h3>
              <p>Update how your account appears inside ScamShield AI.</p>
            </div>
            <span className="settings-card-badge">PROFILE</span>
          </div>

          <form className="settings-form" onSubmit={handleProfileSubmit}>
            <label>
              Full name
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

            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={191}
                required
              />
            </label>

            {emailChanged && (
              <label>
                Current password
                <input
                  type="password"
                  value={profilePassword}
                  onChange={(event) => setProfilePassword(event.target.value)}
                  autoComplete="current-password"
                  maxLength={72}
                  placeholder="Required to change your email"
                  required
                />
                <small className="settings-help">
                  A verification link is sent to the new address before it
                  replaces your current one.
                </small>
              </label>
            )}

            <Notice notice={profileNotice} />

            <div className="settings-form-actions">
              <button
                type="submit"
                className="settings-primary"
                disabled={profileSaving}
              >
                {profileSaving ? "Saving…" : "Save profile"}
              </button>
              <button
                type="button"
                className="settings-secondary"
                onClick={() => {
                  setName(profile?.name || "");
                  setEmail(profile?.email || "");
                  setProfilePassword("");
                  setProfileNotice(null);
                }}
              >
                Reset
              </button>
            </div>
          </form>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading">
            <div>
              <h3>Change password</h3>
              <p>Use a password you do not reuse on another website.</p>
            </div>
            <span className="settings-card-badge">SECURITY</span>
          </div>

          <form className="settings-form" onSubmit={handlePasswordSubmit}>
            <label>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                maxLength={72}
                required
              />
            </label>

            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />
              <small className="settings-help">
                8–72 characters with at least one letter and one number.
              </small>
            </label>

            <label>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />
            </label>

            <Notice notice={passwordNotice} />

            <div className="settings-form-actions">
              <button
                type="submit"
                className="settings-primary"
                disabled={passwordSaving}
              >
                {passwordSaving ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>

          <div className="settings-security-note">
            <span>🔒</span>
            <p>
              Changing your password signs out every other device. You stay
              signed in here until this session expires.
            </p>
          </div>
        </section>
      </div>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-card-heading">
            <div>
              <h3>Active sessions</h3>
              <p>Devices that can currently open your account without a password.</p>
            </div>
            <span className="settings-card-badge">DEVICES</span>
          </div>

          {sessionsLoading ? (
            <p className="settings-empty">Loading your sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="settings-empty">No active sessions were found.</p>
          ) : (
            <div className="session-list">
              {sessions.map((session) => (
                <div className="session-row" key={session.id}>
                  <span className="session-icon" aria-hidden="true">
                    💻
                  </span>
                  <div className="session-copy">
                    <strong>
                      {session.device}
                      {session.current && (
                        <em className="session-current">This device</em>
                      )}
                    </strong>
                    <span>
                      {session.ipAddress ? `${session.ipAddress} · ` : ""}
                      Signed in {formatDate(session.createdAt)} · Last active{" "}
                      {formatDate(session.lastUsedAt)}
                    </span>
                  </div>
                  {!session.current && (
                    <button
                      type="button"
                      className="session-revoke"
                      onClick={() => handleRevokeSession(session)}
                      disabled={revokingId === session.id}
                    >
                      {revokingId === session.id ? "Signing out…" : "Sign out"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <Notice notice={sessionsNotice} />

          {otherSessions.length > 0 && (
            <div className="settings-card-actions">
              <button
                type="button"
                className="settings-secondary"
                onClick={handleRevokeOtherSessions}
              >
                Sign out all other devices
              </button>
            </div>
          )}
        </section>

        <section className="settings-card">
          <div className="settings-card-heading">
            <div>
              <h3>Your data</h3>
              <p>Own a copy of your scans, or start over with a clean history.</p>
            </div>
            <span className="settings-card-badge">PRIVACY</span>
          </div>

          <ul className="data-list">
            <li>Scan history is stored with your account only and never shared.</li>
            <li>Uploaded images are deleted when you remove a scan.</li>
            <li>Export downloads a JSON file with every result you have.</li>
          </ul>

          <Notice notice={dataNotice} />

          <div className="settings-card-actions">
            <button
              type="button"
              className="settings-primary"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? "Preparing…" : "Download my data"}
            </button>
            <button
              type="button"
              className="settings-secondary"
              onClick={handleClearHistory}
              disabled={clearing}
            >
              {clearing ? "Clearing…" : "Clear scan history"}
            </button>
          </div>
        </section>
      </div>

      <section className="settings-card danger-card">
        <div className="settings-card-heading">
          <div>
            <h3>Delete account</h3>
            <p>
              This permanently removes your profile, scans, results and uploaded
              images. This cannot be undone.
            </p>
          </div>
          <span className="settings-card-badge danger">DANGER ZONE</span>
        </div>

        <form className="settings-form delete-form" onSubmit={handleDeleteSubmit}>
          <label>
            Confirm with your password
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              autoComplete="current-password"
              maxLength={72}
              placeholder="Enter your password"
              required
            />
          </label>

          <label className="delete-check">
            <input
              type="checkbox"
              checked={deleteConfirmed}
              onChange={(event) => setDeleteConfirmed(event.target.checked)}
            />
            <span>
              I understand that my account and all scan history will be deleted
              permanently.
            </span>
          </label>

          <Notice notice={deleteNotice} />

          <div className="settings-form-actions">
            <button
              type="submit"
              className="settings-danger"
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default Settings;
