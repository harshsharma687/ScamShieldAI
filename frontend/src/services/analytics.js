import posthog from "posthog-js";

/**
 * Product analytics + Session Replay (PostHog).
 *
 * Nothing is sent — and the SDK is not even started — until the visitor says
 * yes in the consent banner, so the app keeps working exactly as before when
 * VITE_POSTHOG_KEY is empty or the visitor declines.
 *
 * Recording is input-masked: every input/textarea value is masked by the SDK,
 * and app text that may contain scanned user content is tagged with
 * `data-ph-mask` (masked text) or `data-ph-block` (not recorded at all).
 */
const API_KEY = (import.meta.env.VITE_POSTHOG_KEY || "").trim();
const API_HOST = (
  import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com"
).replace(/\/$/, "");

export const ANALYTICS_CONSENT_KEY = "scamshield:analytics-consent";

/**
 * Session Replay masking rules, shared by every start path below.
 *
 * `maskAllInputs` covers every text/password/URL field. The SDK still records
 * `hidden` and `file` input values unmasked, so those element types are blocked
 * outright, next to the app's own `data-ph-block` opt-out.
 */
export const SESSION_RECORDING_OPTIONS = {
  maskAllInputs: true,
  maskTextSelector: "[data-ph-mask]",
  blockSelector: "[data-ph-block], input[type='file'], input[type='hidden']",
};

let initialized = false;

/** True only when a PostHog project key is configured for this build. */
export function isAnalyticsConfigured() {
  return Boolean(API_KEY);
}

/** "granted" | "denied" | null (never asked). */
export function getAnalyticsConsent() {
  try {
    const value = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

function startClient() {
  if (initialized || !isAnalyticsConfigured()) return false;

  posthog.init(API_KEY, {
    api_host: API_HOST,
    // Pin behaviour to a known defaults snapshot instead of "whatever the
    // currently installed SDK release changed".
    defaults: "2025-05-24",
    // localStorage only: no PostHog cookie is written.
    persistence: "localStorage",
    person_profiles: "identified_only",
    // No DOM autocapture of this security app; events are captured explicitly.
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: false,
    session_recording: SESSION_RECORDING_OPTIONS,
    // A visitor who asks not to be tracked is treated as a "no" even if they
    // later clear the stored answer.
    respect_dnt: true,
  });

  initialized = true;
  return true;
}

/**
 * Called once from `main.jsx`. Returns whether tracking is active.
 * Without an explicit opt-in nothing is initialised.
 */
export function initAnalytics() {
  if (getAnalyticsConsent() !== "granted") return false;

  startClient();

  if (!initialized) return false;

  // Consent was given on an earlier visit: resume recording for this page load.
  posthog.startSessionRecording();
  return true;
}

/** Stores the visitor's decision and applies it to the running client. */
export function setAnalyticsConsent(decision) {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, decision);
  } catch {
    // Storage can be blocked (private mode); the choice still applies to this page load.
  }

  if (decision !== "granted") {
    if (initialized) {
      posthog.stopSessionRecording();
      posthog.opt_out_capturing();
      posthog.reset();
    }
    return false;
  }

  startClient();
  posthog.opt_in_capturing();
  posthog.startSessionRecording();
  return true;
}

/** Links the current replay to the signed-in account (id only, no email). */
export function identifyUser(user) {
  if (!initialized || !user?.id) return;
  posthog.identify(String(user.id));
}

/** Called on sign-out so the next session starts with a fresh anonymous id. */
export function resetAnalytics() {
  if (!initialized) return;
  posthog.reset();
}

/** Captures a user journey event, e.g. "scan_completed". No-op before consent. */
export function captureEvent(event, properties = {}) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

export default posthog;
