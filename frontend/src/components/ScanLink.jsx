import { useState } from "react";
import { api, getApiError, notifyScanUpdated } from "../services/api";
import BilingualAnswer from "./BilingualAnswer";
import "./ScanLink.css";

function ScanLink({ onRequireAuth }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleScan() {
    setResult(null);

    if (!url.trim()) {
      setResult({ error: "Please enter a website URL." });
      return;
    }

    const raw = url.trim();
    let target = raw;

    // A scheme is only checked when the visitor typed one. A bare
    // "example.com" is normalised to https:// by the backend instead of being
    // rejected here.
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      let parsedUrl;

      try {
        parsedUrl = new URL(raw);
      } catch {
        setResult({
          error:
            "Invalid URL. Please enter a complete URL, such as https://example.com",
        });
        return;
      }

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        setResult({ error: "Only HTTP and HTTPS links are supported." });
        return;
      }

      target = parsedUrl.href;
    }

    if (onRequireAuth && !onRequireAuth()) return;

    setLoading(true);

    try {
      const response = await api.scans.link(target);
      setResult(response.data.data.result);
      notifyScanUpdated();
    } catch (error) {
      setResult({ error: getApiError(error, "The link could not be scanned.") });
      notifyScanUpdated();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="scan-link-page">
      <div className="link-heading">
        <div>
          <span className="link-label">WEBSITE SECURITY</span>
          <h2>Scan Link</h2>
          <p>Check suspicious website links before opening them.</p>
        </div>
        <div className="link-shield">🔗</div>
      </div>

      <div className="link-banner">
        <span>🛡️</span>
        <div>
          <h3>Stay Safe Online</h3>
          <p>
            Check a website URL before sharing personal information
            or entering your account details.
          </p>
        </div>
      </div>

      <div className="link-scan-card">
        <h3>Enter Website URL</h3>
        <p>Paste the complete link you want to check.</p>

        <div className="url-input-area">
          <span>🔗</span>
          <input
            type="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setResult(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleScan();
            }}
            placeholder="https://example.com"
          />
        </div>

        <button
          className="link-scan-button"
          onClick={handleScan}
          disabled={loading}
        >
          {loading ? "Checking URL..." : "🛡️ Check Website"}
        </button>

        {result && (
          <div className="link-result">
            {result.error ? (
              <>
                <strong>Scan Failed</strong>
                <p>{result.error}</p>
              </>
            ) : (
              <>
                <strong>
                  {result.riskLevel} Risk · {result.riskScore}/100
                </strong>
                <BilingualAnswer result={result} />
                {!result.verified && (
                  <p className="answer-verified-note">
                    <strong>Note:</strong> This result is not AI-verified.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="link-warning">
        <span>⚠️</span>
        <p>
          Never enter your password, OTP, banking details or personal
          information on an unverified website. A low risk score does not
          prove that a website is safe.
        </p>
      </div>
    </div>
  );
}

export default ScanLink;
