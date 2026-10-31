import { useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import ScanImage from "./components/ScanImage";
import ScanLink from "./components/ScanLink";
import ScanMessage from "./components/ScanMessage";
import ScanHistory from "./components/ScanHistory";
import Settings from "./components/Settings";
import AuthGate from "./components/AuthGate";
import BilingualAnswer from "./components/BilingualAnswer";
import { useAuth } from "./context/useAuth";
import {
  api,
  getApiError,
  notifyScanUpdated,
  resolveAssetUrl,
} from "./services/api";
import { captureEvent } from "./services/analytics";
import { formatDate } from "./utils/format";
import "./App.css";

function ResultBox({ result }) {
  if (!result) return null;

  return (
    <div className={`modal-result ${result.riskScore >= 30 ? "risk" : ""}`}>
      <strong>
        {result.riskLevel} Risk · {result.riskScore}/100
      </strong>
      <BilingualAnswer result={result} />
      {!result.verified && (
        <p className="demo-note">
          Not AI-verified — this result is based on deterministic checks only.
        </p>
      )}
    </div>
  );
}

function GuestPanel({ title, description, onSignIn }) {
  return (
    <section className="panel guest-panel">
      <span className="guest-panel-icon">🔒</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="primary-button" type="button" onClick={onSignIn}>
        Sign in to continue
      </button>
    </section>
  );
}

function App() {
  const { user, logout } = useAuth();
  const [activePage, setActivePage] = useState("Dashboard");
  const [showAuth, setShowAuth] = useState(false);
  const [pendingPage, setPendingPage] = useState(null);
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [showMessageBox, setShowMessageBox] = useState(false);
  const [showLinkBox, setShowLinkBox] = useState(false);
  const [showUploadBox, setShowUploadBox] = useState(false);
  const [modalResult, setModalResult] = useState(null);
  const [modalError, setModalError] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const fileInput = useRef(null);

  // Journey event for the "page" a replay was on (the app navigates by state).
  useEffect(() => {
    if (!user) return;
    captureEvent("page_viewed", { page: activePage });
  }, [user, activePage]);

  useEffect(() => {
    if (!user) return undefined;

    let mounted = true;

    async function loadDashboard() {
      setDashboardLoading(true);
      setDashboardError("");

      try {
        const [statsResponse, recentResponse] = await Promise.all([
          api.dashboard.stats(),
          api.dashboard.recentScans(5),
        ]);

        if (!mounted) return;

        setStats(statsResponse.data.data);
        setRecentScans(recentResponse.data.data.scans);
      } catch (error) {
        if (mounted) {
          setDashboardError(
            getApiError(error, "Could not load your dashboard data.")
          );
        }
      } finally {
        if (mounted) setDashboardLoading(false);
      }
    }

    loadDashboard();

    const handleScanUpdated = () => loadDashboard();
    window.addEventListener("scan-history-updated", handleScanUpdated);

    return () => {
      mounted = false;
      window.removeEventListener("scan-history-updated", handleScanUpdated);
    };
  }, [user]);

  // Guest visitors see the real website with empty statistics rather than a
  // fake spinner or demo numbers.
  const showDashboardLoading = Boolean(user) && dashboardLoading;

  function requireAuth() {
    if (user) return true;
    setShowAuth(true);
    return false;
  }

  function handleNavigate(page) {
    if (!user && (page === "History" || page === "Settings")) {
      setPendingPage(page);
      setShowAuth(true);
      return;
    }

    setActivePage(page);
  }

  // AuthGate calls this after a successful sign-in/registration.
  function handleAuthenticated() {
    setShowAuth(false);

    if (pendingPage) {
      setActivePage(pendingPage);
      setPendingPage(null);
    }
  }

  async function handleLogout() {
    setActivePage("Dashboard");
    setPendingPage(null);
    setStats(null);
    setRecentScans([]);
    setDashboardError("");
    setShowMessageBox(false);
    setShowLinkBox(false);
    setShowUploadBox(false);
    setModalResult(null);
    setModalError("");
    await logout();
  }

  function openAuth() {
    setShowAuth(true);
  }

  // Guests never see another session's cached counts; forced sign-out also
  // drops straight back to zeros because every value is derived from `user`.
  const dashboardScans = user ? recentScans : [];
  const totalScans = user ? stats?.totalScans ?? 0 : 0;
  const safeItems = user ? stats?.safeItems ?? 0 : 0;
  const suspiciousItems = user
    ? (stats?.suspiciousItems ?? 0) + (stats?.needsReviewItems ?? 0)
    : 0;
  const filesUploaded = user ? stats?.filesUploaded ?? 0 : 0;
  const unverifiedItems = user ? stats?.unverifiedItems ?? 0 : 0;
  const safePercent = totalScans
    ? Math.round((safeItems / totalScans) * 100)
    : 0;

  const alerts = dashboardScans
    .filter(
      (scan) => scan.status === "Suspicious" || scan.status === "Needs Review"
    )
    .slice(0, 3)
    .map((scan) => ({
      title: `${scan.status} ${scan.type.toLowerCase()} detected`,
      time: formatDate(scan.date),
    }));

  function resetModal() {
    setModalResult(null);
    setModalError("");
  }

  function openMessageModal() {
    if (!requireAuth()) return;
    resetModal();
    setShowMessageBox(true);
  }

  function openLinkModal() {
    if (!requireAuth()) return;
    resetModal();
    setShowLinkBox(true);
  }

  async function scanMessage() {
    if (!requireAuth()) return;

    if (!message.trim()) {
      setModalError("Please enter a message first.");
      return;
    }

    setModalLoading(true);
    resetModal();

    try {
      const response = await api.scans.message(message.trim());
      setModalResult(response.data.data.result);
      captureEvent("scan_completed", {
        scan_type: "message",
        risk_level: response.data.data.result?.riskLevel,
        risk_score: response.data.data.result?.riskScore,
      });
      notifyScanUpdated();
    } catch (error) {
      captureEvent("scan_failed", { scan_type: "message" });
      setModalError(getApiError(error, "The message could not be scanned."));
      notifyScanUpdated();
    } finally {
      setModalLoading(false);
    }
  }

  async function scanLink() {
    if (!requireAuth()) return;

    if (!url.trim()) {
      setModalError("Please enter a URL first.");
      return;
    }

    setModalLoading(true);
    resetModal();

    try {
      const response = await api.scans.link(url.trim());
      setModalResult(response.data.data.result);
      captureEvent("scan_completed", {
        scan_type: "link",
        risk_level: response.data.data.result?.riskLevel,
        risk_score: response.data.data.result?.riskScore,
      });
      notifyScanUpdated();
    } catch (error) {
      captureEvent("scan_failed", { scan_type: "link" });
      setModalError(getApiError(error, "The link could not be scanned."));
      notifyScanUpdated();
    } finally {
      setModalLoading(false);
    }
  }

  async function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!requireAuth()) {
      event.target.value = "";
      return;
    }

    event.target.value = "";

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      resetModal();
      setModalError(
        "Only JPG and PNG image analysis is available. PDF and TXT files are not analyzed by this backend."
      );
      setShowUploadBox(true);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      resetModal();
      setModalError("Image size must be under 10 MB.");
      setShowUploadBox(true);
      return;
    }

    resetModal();
    setShowUploadBox(true);
    setModalLoading(true);

    try {
      const response = await api.scans.image(file);
      setModalResult(response.data.data.result);
      captureEvent("scan_completed", {
        scan_type: "image",
        risk_level: response.data.data.result?.riskLevel,
        risk_score: response.data.data.result?.riskScore,
      });
      notifyScanUpdated();
    } catch (error) {
      captureEvent("scan_failed", { scan_type: "image" });
      setModalError(getApiError(error, "The image could not be scanned."));
      notifyScanUpdated();
    } finally {
      setModalLoading(false);
    }
  }

  return (
    <div className="app-layout">
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        signedIn={Boolean(user)}
      />

      <main className="main-content">
        {/* TOPBAR */}
        <header className="topbar">
          <div>
            <h1>{activePage}</h1>
            <p>
              {user
                ? `Welcome back, ${user.name}! Stay safe with ScamShield AI.`
                : "Explore the app first. Sign in when you are ready to scan and save results."}
            </p>
          </div>

          <div className="topbar-right">
            <span className="notification">🔔</span>

            <div className="profile">
              <div
                className={`profile-avatar ${
                  user?.profileImage ? "has-image" : ""
                }`}
                style={
                  user?.profileImage
                    ? {
                        backgroundImage: `url("${resolveAssetUrl(
                          user.profileImage
                        )}")`,
                      }
                    : undefined
                }
              >
                {!user?.profileImage &&
                  (user ? user.name?.charAt(0).toUpperCase() || "U" : "G")}
              </div>
              <div>
                <strong>{user ? user.name : "Guest"}</strong>
                <small>{user ? user.email : "Not signed in"}</small>
              </div>
            </div>

            {user ? (
              <button
                className="text-button"
                onClick={handleLogout}
                type="button"
              >
                Sign out
              </button>
            ) : (
              <button
                className="topbar-signin"
                onClick={openAuth}
                type="button"
              >
                Sign in
              </button>
            )}
          </div>
        </header>

        {user && dashboardError && activePage === "Dashboard" && (
          <div className="panel" style={{ marginBottom: 18, color: "var(--danger)" }}>
            {dashboardError}
            <button
              className="text-button"
              type="button"
              onClick={() => notifyScanUpdated()}
            >
              Retry
            </button>
          </div>
        )}

        {/* DASHBOARD */}
        {activePage === "Dashboard" ? (
          <>
            {/* WELCOME BANNER */}
            <section className="welcome-banner">
              <div>
                <span className="welcome-tag">
                  YOUR DIGITAL SAFETY PARTNER
                </span>

                <h2>Welcome to ScamShield AI 🛡️</h2>

                <p>
                  Detect suspicious messages, links and files.
                  Stay one step ahead of online scams.
                </p>

                <button onClick={() => setActivePage("Scan Message")}>
                  {user ? "Start Scanning →" : "Explore Scans →"}
                </button>
              </div>

              <div className="welcome-shield">🛡️</div>
            </section>

            {/* STATISTICS */}
            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-icon">🔍</span>
                <p>Total Scans</p>
                <h2>{showDashboardLoading ? "…" : totalScans}</h2>
                <small>All scan types</small>
              </div>

              <div className="stat-card">
                <span className="stat-icon">🛡️</span>
                <p>Safe Items</p>
                <h2>{showDashboardLoading ? "…" : safeItems}</h2>
                <small>Verified low risk</small>
              </div>

              <div className="stat-card">
                <span className="stat-icon">⚠️</span>
                <p>Suspicious Items</p>
                <h2>{showDashboardLoading ? "…" : suspiciousItems}</h2>
                <small>High, critical or needs review</small>
              </div>

              <div className="stat-card">
                <span className="stat-icon">📁</span>
                <p>Files Uploaded</p>
                <h2>{showDashboardLoading ? "…" : filesUploaded}</h2>
                <small>Stored securely</small>
              </div>
            </section>

            {/* DASHBOARD GRID */}
            <section className="dashboard-grid">
              {/* RECENT SCANS */}
              <div className="panel recent-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Recent Scans</h3>
                    <p>Your latest scanning activity</p>
                  </div>

                  <button
                    className="text-button"
                    onClick={() => handleNavigate("History")}
                  >
                    View All →
                  </button>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ITEM</th>
                        <th>TYPE</th>
                        <th>DATE</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>

                    <tbody>
                      {dashboardScans.length === 0 ? (
                        <tr>
                          <td colSpan={4}>
                            {showDashboardLoading
                              ? "Loading your scans…"
                              : user
                                ? "No scans yet. Your scanned items will appear here."
                                : "Sign in to save your scans and see them here."}
                          </td>
                        </tr>
                      ) : (
                        dashboardScans.map((scan) => (
                          <tr key={scan.id}>
                            <td data-ph-mask>{scan.name}</td>
                            <td>{scan.type}</td>
                            <td>{formatDate(scan.date)}</td>
                            <td>
                              <span
                                className={`status ${
                                  scan.status === "Safe" ? "safe" : "warning"
                                }`}
                              >
                                {scan.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="demo-note">
                  {user
                    ? "Live data from your ScamShield account."
                    : "Guest view — statistics start from zero until you sign in."}
                </p>
              </div>

              {/* QUICK SCAN */}
              <div className="panel quick-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Quick Scan</h3>
                    <p>Choose what you want to scan</p>
                  </div>
                </div>

                <button
                  className="scan-option"
                  onClick={() => setActivePage("Scan Image")}
                >
                  <span>🖼️</span>
                  <div>
                    <strong>Scan Image</strong>
                    <small>Check suspicious images</small>
                  </div>
                  <b>›</b>
                </button>

                <button
                  className="scan-option"
                  onClick={() =>
                    user ? openLinkModal() : setActivePage("Scan Link")
                  }
                >
                  <span>🔗</span>
                  <div>
                    <strong>Scan Link</strong>
                    <small>Check suspicious URLs</small>
                  </div>
                  <b>›</b>
                </button>

                <button
                  className="scan-option"
                  onClick={() =>
                    user ? openMessageModal() : setActivePage("Scan Message")
                  }
                >
                  <span>💬</span>
                  <div>
                    <strong>Scan Message</strong>
                    <small>Check suspicious text</small>
                  </div>
                  <b>›</b>
                </button>

                <button
                  className="scan-option"
                  onClick={() => {
                    if (requireAuth()) fileInput.current.click();
                  }}
                >
                  <span>📁</span>
                  <div>
                    <strong>Upload Image</strong>
                    <small>JPG or PNG · Max 10 MB</small>
                  </div>
                  <b>›</b>
                </button>

                <input
                  ref={fileInput}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  hidden
                  onChange={handleFile}
                />
              </div>

              {/* SCAM OVERVIEW */}
              <div className="panel overview-panel">
                <h3>Scam Detection Overview</h3>
                <p>Your scan distribution</p>

                <div className="chart-content">
                  <div
                    className="donut-chart"
                    style={{
                      background: totalScans
                        ? `conic-gradient(#7da99a 0 ${safePercent}%, var(--accent) ${safePercent}% 100%)`
                        : "var(--surface-tint)",
                    }}
                  >
                    <div className="donut-hole">
                      <strong>{showDashboardLoading ? "…" : totalScans}</strong>
                      <small>Total Scans</small>
                    </div>
                  </div>

                  <div className="chart-legend">
                    <span>
                      <i className="legend-safe"></i>
                      Safe <b>{safeItems}</b>
                    </span>

                    <span>
                      <i className="legend-risk"></i>
                      Suspicious <b>{suspiciousItems}</b>
                    </span>

                    {unverifiedItems > 0 && (
                      <small className="demo-note">
                        {unverifiedItems} unverified
                      </small>
                    )}
                  </div>
                </div>
              </div>

              {/* LATEST ALERTS */}
              <div className="panel alerts-panel">
                <h3>Latest Alerts</h3>
                <p>Scans that need your attention</p>

                {alerts.length === 0 ? (
                  <div className="alert-item">
                    <span>✓</span>
                    <div>
                      <strong>No active alerts</strong>
                      <small>Scans that need attention will appear here.</small>
                    </div>
                  </div>
                ) : (
                  alerts.map((alert, index) => (
                    <div className="alert-item" key={index}>
                      <span>⚠️</span>
                      <div>
                        <strong>{alert.title}</strong>
                        <small>{alert.time}</small>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* SAFETY TIPS */}
              <div className="panel tips-panel">
                <h3>Safety Tips</h3>

                <div className="tip-item">
                  ✓ Never share your OTP or password.
                </div>

                <div className="tip-item">
                  ✓ Verify links before clicking.
                </div>

                <div className="tip-item">
                  ✓ Avoid unknown attachments.
                </div>

                <div className="tip-item">
                  ✓ Check the sender before replying.
                </div>
              </div>
            </section>

            {/* MESSAGE MODAL */}
            {user && showMessageBox && (
              <div className="modal-backdrop">
                <div className="scan-modal">
                  <button
                    className="modal-close"
                    onClick={() => {
                      setShowMessageBox(false);
                      resetModal();
                    }}
                  >
                    ×
                  </button>

                  <h2>Scan Message</h2>
                  <p>Paste a message for AI and rule-based scam analysis.</p>

                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Paste your suspicious message here..."
                  />

                  {modalError && <p className="modal-error">{modalError}</p>}
                  {modalResult && <ResultBox result={modalResult} />}

                  <button
                    className="primary-button"
                    onClick={scanMessage}
                    disabled={modalLoading}
                  >
                    {modalLoading ? "Scanning…" : "Check Message"}
                  </button>
                </div>
              </div>
            )}

            {/* LINK MODAL */}
            {user && showLinkBox && (
              <div className="modal-backdrop">
                <div className="scan-modal">
                  <button
                    className="modal-close"
                    onClick={() => {
                      setShowLinkBox(false);
                      resetModal();
                    }}
                  >
                    ×
                  </button>

                  <h2>Scan Link</h2>
                  <p>Enter a URL to check its risk signals.</p>

                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://example.com"
                  />

                  {modalError && <p className="modal-error">{modalError}</p>}
                  {modalResult && <ResultBox result={modalResult} />}

                  <button
                    className="primary-button"
                    onClick={scanLink}
                    disabled={modalLoading}
                  >
                    {modalLoading ? "Checking URL…" : "Check Link"}
                  </button>
                </div>
              </div>
            )}

            {/* IMAGE UPLOAD MODAL */}
            {user && showUploadBox && (
              <div className="modal-backdrop">
                <div className="scan-modal">
                  <button
                    className="modal-close"
                    onClick={() => {
                      setShowUploadBox(false);
                      resetModal();
                    }}
                  >
                    ×
                  </button>

                  <h2>Scan Image</h2>
                  <p>
                    {modalLoading
                      ? "Analyzing your image…"
                      : "Image scan result"}
                  </p>

                  {modalError && <p className="modal-error">{modalError}</p>}
                  {modalResult && <ResultBox result={modalResult} />}

                  <button
                    className="primary-button"
                    onClick={() => {
                      setShowUploadBox(false);
                      resetModal();
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </>
        ) : activePage === "Scan Image" ? (
          <ScanImage onRequireAuth={requireAuth} />
        ) : activePage === "Scan Link" ? (
          <ScanLink onRequireAuth={requireAuth} />
        ) : activePage === "Scan Message" ? (
          <ScanMessage onRequireAuth={requireAuth} />
        ) : activePage === "History" ? (
          user ? (
            <ScanHistory />
          ) : (
            <GuestPanel
              title="Your scan history is private"
              description="Create a free account or sign in to save scans and see them here."
              onSignIn={openAuth}
            />
          )
        ) : activePage === "Settings" ? (
          user ? (
            <Settings />
          ) : (
            <GuestPanel
              title="Sign in to manage your account"
              description="Profile details, password and account controls are private to your account."
              onSignIn={openAuth}
            />
          )
        ) : (
          <section className="placeholder-panel">
            <h2>{activePage}</h2>
            <p>This section will be developed in the next steps.</p>

            <button onClick={() => setActivePage("Dashboard")}>
              Back to Dashboard
            </button>
          </section>
        )}

        <footer className="page-footer">
          ScamShield AI · Your safety matters. Never upload OTPs,
          passwords or confidential information.
        </footer>
      </main>

      {showAuth && !user && (
        <AuthGate
          prompt="Sign in to scan, save results and keep your history private."
          onAuthenticated={handleAuthenticated}
          onClose={() => {
            setShowAuth(false);
            setPendingPage(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
