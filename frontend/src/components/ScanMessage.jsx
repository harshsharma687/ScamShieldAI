import { useState } from "react";
import { api, getApiError, notifyScanUpdated } from "../services/api";
import BilingualAnswer from "./BilingualAnswer";
import "./ScanMessage.css";

function ScanMessage({ onRequireAuth }) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleScan() {
    if (!message.trim()) {
      setResult({
        type: "error",
        title: "Message Required",
        description: "Please paste a message before scanning.",
      });
      return;
    }

    if (onRequireAuth && !onRequireAuth()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await api.scans.message(message.trim());
      const scanResult = response.data.data.result;

      setResult({
        type: scanResult.riskScore >= 30 ? "warning" : "info",
        title: `${scanResult.riskLevel} Risk · ${scanResult.riskScore}/100`,
        scanResult,
      });

      notifyScanUpdated();
    } catch (error) {
      setResult({
        type: "error",
        title: "Scan Failed",
        description: getApiError(error, "The message could not be scanned."),
      });
      notifyScanUpdated();
    } finally {
      setLoading(false);
    }
  }

  function clearMessage() {
    setMessage("");
    setResult(null);
  }

  return (
    <div className="scan-message-page">
      <div className="message-heading">
        <div>
          <span className="message-label">MESSAGE SECURITY</span>
          <h2>Scan Message</h2>
          <p>Check suspicious SMS, WhatsApp messages and emails.</p>
        </div>
        <div className="message-icon">💬</div>
      </div>

      <div className="message-banner">
        <span>🛡️</span>
        <div>
          <h3>Think Before You Trust</h3>
          <p>
            Identify suspicious requests, links and warning signs
            before responding to an unknown message.
          </p>
        </div>
      </div>

      <div className="message-card">
        <h3>Paste Your Message</h3>
        <p>Copy and paste the message you want to check.</p>

        <textarea
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            setResult(null);
          }}
          placeholder="Paste your suspicious SMS, WhatsApp message or email here..."
        />

        <div className="message-actions">
          <button
            className="message-scan-button"
            onClick={handleScan}
            disabled={loading}
          >
            {loading ? "Scanning..." : "🛡️ Scan Message"}
          </button>

          <button
            className="message-clear-button"
            onClick={clearMessage}
          >
            Clear
          </button>
        </div>

        {result && (
          <div className={`message-result ${result.type}`}>
            <h4>{result.title}</h4>
            {result.scanResult ? (
              <>
                <BilingualAnswer result={result.scanResult} />
                {!result.scanResult.verified && (
                  <p className="answer-verified-note">
                    <strong>Note:</strong> This result is not AI-verified.
                  </p>
                )}
              </>
            ) : (
              <p data-ph-mask>{result.description}</p>
            )}
          </div>
        )}
      </div>

      <div className="message-warning">
        <span>⚠️</span>
        <p>
          Never paste real OTPs, passwords, bank details or other
          confidential information. ScamShield combines AI (when configured)
          with deterministic checks; a low score is not a guarantee.
        </p>
      </div>
    </div>
  );
}

export default ScanMessage;
