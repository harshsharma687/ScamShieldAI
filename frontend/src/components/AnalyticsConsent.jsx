import { useState } from "react";
import {
  getAnalyticsConsent,
  isAnalyticsConfigured,
  setAnalyticsConsent,
} from "../services/analytics";
import "./AnalyticsConsent.css";

/**
 * Minimal opt-in prompt for PostHog Session Replay. It renders nothing unless a
 * PostHog key is configured, and it remembers the answer so it is asked once.
 */
function AnalyticsConsent() {
  const [consent, setConsent] = useState(() => getAnalyticsConsent());

  if (!isAnalyticsConfigured() || consent) return null;

  function choose(decision) {
    setAnalyticsConsent(decision);
    setConsent(decision);
  }

  return (
    <aside className="analytics-consent" aria-label="Analytics consent">
      <p>
        <strong>Help us improve ScamShield AI.</strong> With your permission we
        record masked session replays — typed text is never captured — to see
        where the app is confusing.
      </p>

      <div className="analytics-consent-actions">
        <button
          type="button"
          className="analytics-consent-allow"
          onClick={() => choose("granted")}
        >
          Allow
        </button>

        <button
          type="button"
          className="analytics-consent-deny"
          onClick={() => choose("denied")}
        >
          No thanks
        </button>
      </div>
    </aside>
  );
}

export default AnalyticsConsent;
