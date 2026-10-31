/**
 * Message scam detection.
 *
 * The deterministic rules look for explicit requests and known social-
 * engineering patterns. They deliberately avoid scoring a bare word such as
 * "OTP" or "bank": there must be a request, a threat or another indicator.
 * Negated advice ("never share your OTP") is ignored.
 */
const AppError = require("../utils/AppError");
const { analyzeWithAI, AiServiceError } = require("./aiDetectionService");
const { normalizeUrl, getUrlIndicators } = require("./urlDetectionService");
const {
  clampScore,
  combineScores,
  classifyRisk,
  isScamScore,
  buildRecommendation,
} = require("../utils/risk");

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

const RULES = [
  {
    code: "otp-request",
    label: "Asks for an OTP or verification code",
    weight: 40,
    pattern:
      /(?:send|share|tell|give|provide|forward|reply\s+with|type|enter|confirm)\b[^.!?\n]{0,50}\b(?:otp|one[\s-]?time\s+(?:password|code)|verification\s+code|security\s+code)\b/i,
  },
  {
    code: "otp-request-reverse",
    label: "Asks for an OTP or verification code",
    weight: 40,
    pattern:
      /\b(?:otp|one[\s-]?time\s+(?:password|code)|verification\s+code|security\s+code)\b[^.!?\n]{0,50}\b(?:send|share|tell|give|provide|forward|reply)\b/i,
  },
  {
    code: "password-request",
    label: "Asks for a password, PIN or credentials",
    weight: 35,
    pattern:
      /(?:send|share|tell|give|provide|confirm|enter|verify|update)\b[^.!?\n]{0,45}\b(?:password|passcode|pin|credentials?|login\s+details)\b/i,
  },
  {
    code: "card-details",
    label: "Mentions card or bank credentials",
    weight: 25,
    pattern:
      /\b(?:card\s*(?:number|details)|cvv|cvc|expiry\s*date|debit\s*card|credit\s*card|bank\s*(?:details|account)|account\s*number|ifsc|routing\s*number|ssn|aadhaar|pan\s*card)\b/i,
  },
  {
    code: "money-request",
    label: "Requests a money transfer or payment",
    weight: 25,
    pattern:
      /(?:\b(?:send|transfer|wire|pay)\b[^.!?\n]{0,35}\b(?:money|cash|funds|usd|inr|rs\.?|₹|\$)\b)|(?:\b(?:gift\s*card|itunes\s*card|google\s*play\s*card|bitcoin|crypto\s*wallet|upi\s*id)\b)/i,
  },
  {
    code: "prize",
    label: "Claims a prize, lottery win or free gift",
    weight: 20,
    pattern:
      /\b(?:you(?:'ve|\s+have)?\s+won|winner|lottery|lucky\s+draw|prize|jackpot|claim\s+(?:your\s+)?(?:prize|reward|gift)|free\s+gift)\b/i,
  },
  {
    code: "urgency",
    label: "Uses urgency or a deadline",
    weight: 12,
    pattern:
      /\b(?:urgent|immediately|act\s+now|right\s+now|within\s+\d+\s+(?:minutes?|hours?|days?)|last\s+chance|final\s+warning|expires?\s+(?:today|soon))\b/i,
  },
  {
    code: "account-threat",
    label: "Threatens that an account or card will be blocked",
    weight: 12,
    pattern:
      /\b(?:account|card|wallet)\b[^.!?\n]{0,25}\b(?:blocked|suspended|deactivated|locked|closed|frozen)\b|\b(?:blocked|suspended|deactivated|locked|closed|frozen)\b[^.!?\n]{0,25}\b(?:account|card|wallet)\b/i,
  },
  {
    code: "impersonation",
    label: "Claims to be from a bank, company or authority",
    weight: 10,
    pattern:
      /\b(?:this\s+is|on\s+behalf\s+of|from)\b[^.!?\n]{0,35}\b(?:bank|amazon|microsoft|apple|paypal|google|netflix|government|irs|police|customs|tax\s+department|support\s+team)\b/i,
  },
  {
    code: "secrecy",
    label: "Asks you to keep the request secret",
    weight: 15,
    pattern:
      /\b(?:do\s+not|don't|never)\s+(?:tell|inform)\s+(?:anyone|anybody|your\s+(?:family|bank|employer))\b|\bkeep\s+(?:this|it)\s+(?:secret|confidential|between\s+us)\b/i,
  },
  {
    code: "investment",
    label: "Promises unrealistic jobs, investments or returns",
    weight: 15,
    pattern:
      /\b(?:guaranteed\s+returns?|double\s+your\s+money|work\s+from\s+home|earn\s+[^.!?\n]{0,12}(?:per|a)\s*(?:day|week)|investment\s+opportunity|no\s+risk)\b/i,
  },
  {
    code: "click-here",
    label: "Pushes you to click a link",
    weight: 8,
    pattern: /\b(?:click|tap)\s+(?:here|this\s+link|the\s+link|below)\b/i,
  },
  {
    code: "verify-account",
    label: "Asks you to verify an account or identity",
    weight: 12,
    pattern: /\bverify\s+(?:your\s+)?(?:account|identity|details|information|kyc)\b/i,
  },
  {
    code: "kyc-refund",
    label: "Mentions KYC, refunds or a held delivery",
    weight: 10,
    pattern:
      /\b(?:kyc|refund|reimbursement|pending\s+payment|delivery\s+failed|parcel\s+held)\b/i,
  },
  {
    code: "crypto-address",
    label: "Contains a cryptocurrency wallet address",
    weight: 15,
    pattern: /\b(?:0x[a-f0-9]{40}|bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/,
  },
  {
    code: "generic-greeting",
    label: "Uses a generic greeting common in bulk scams",
    weight: 5,
    pattern: /\b(?:dear\s+(?:customer|user|member|sir\/madam)|valued\s+customer)\b/i,
  },
  {
    code: "attachment",
    label: "References an attachment or executable file",
    weight: 10,
    pattern: /\b(?:attachment|invoice\.(?:pdf|zip|html?)|\.apk|\.exe|\.scr)\b/i,
  },
  {
    code: "legal-threat",
    label: "Threatens legal action, fines or arrest",
    weight: 12,
    pattern:
      /\b(?:legal\s+action|fine|penalty|case\s+filed|arrest|court\s+notice)\b/i,
  },
];

function isNegated(text, matchIndex) {
  if (matchIndex <= 0) return false;

  const before = text.slice(Math.max(0, matchIndex - 35), matchIndex).toLowerCase();

  return /(?:never|do\s+not|don't|dont|avoid|without)\s+(?:\w+\s+){0,3}$/.test(before);
}

function extractUrls(text) {
  const matches = text.match(URL_PATTERN) || [];
  const cleaned = matches
    .map((value) => value.replace(/[.,;:!?)\]}]+$/g, "").trim())
    .filter(Boolean)
    .slice(0, 5);

  return [...new Set(cleaned)];
}

function analyzeUrlEvidence(text, addSignal) {
  const urls = extractUrls(text);
  let highestLinkScore = 0;
  let hasShortener = false;
  let hasPrivateLink = false;
  const linkLabels = [];

  for (const candidate of urls) {
    let parsed;

    try {
      parsed = normalizeUrl(candidate);
    } catch (error) {
      if (error instanceof AppError && error.code === "BLOCKED_DESTINATION") {
        hasPrivateLink = true;
      }
      continue;
    }

    const indicators = getUrlIndicators(parsed);

    highestLinkScore = Math.max(
      highestLinkScore,
      indicators.reduce((total, item) => total + item.weight, 0)
    );

    if (indicators.some((item) => item.code === "shortener")) hasShortener = true;
    linkLabels.push(
      ...indicators.slice(0, 2).map((item) => item.label)
    );
  }

  if (urls.length) {
    addSignal("message-link", "Contains a web link", 6);
  }

  if (hasShortener) {
    addSignal("shortened-link", "Contains a shortened link that hides its destination", 15);
  }

  if (hasPrivateLink) {
    addSignal(
      "private-link",
      "Contains a link to a localhost or private-network address",
      30
    );
  }

  if (highestLinkScore > 0) {
    const weight = Math.min(25, Math.round(highestLinkScore * 0.35));
    const detail = [...new Set(linkLabels)].slice(0, 3).join("; ");

    addSignal(
      "suspicious-link",
      `Contains a link with suspicious URL structure${detail ? ` (${detail})` : ""}`,
      weight
    );
  }

  return { urls, highestLinkScore, hasShortener, hasPrivateLink };
}

function getMessageIndicators(text) {
  const indicators = [];
  const seen = new Set();

  function addSignal(code, label, weight) {
    if (seen.has(code)) return;
    seen.add(code);
    indicators.push({ code, label, weight });
  }

  for (const rule of RULES) {
    const match = text.match(rule.pattern);

    if (!match) continue;
    if (isNegated(text, match.index ?? 0)) continue;

    addSignal(rule.code, rule.label, rule.weight);
  }

  const linkEvidence = analyzeUrlEvidence(text, addSignal);

  const credentialRequest = ["otp-request", "otp-request-reverse", "password-request", "card-details"].some(
    (code) => seen.has(code)
  );
  const moneyRequest = seen.has("money-request");

  if (credentialRequest && linkEvidence.urls.length) {
    addSignal(
      "credential-plus-link",
      "Combines a credential request with a link",
      15
    );
  }

  if (moneyRequest && (seen.has("urgency") || linkEvidence.urls.length)) {
    addSignal(
      "payment-pressure",
      "Combines a payment request with pressure or a link",
      10
    );
  }

  return indicators;
}

function buildMessageExplanation({ indicators, ai, aiError, riskLevel }) {
  const parts = [];

  if (indicators.length) {
    parts.push(`Deterministic analysis found: ${indicators.map((item) => item.label).join("; ")}.`);
  } else {
    parts.push("Deterministic analysis found no specific scam indicators.");
  }

  if (ai) {
    parts.push(`AI analysis: ${ai.explanation}`);
  } else {
    parts.push(
      `AI analysis was unavailable${
        aiError?.code === "AI_NOT_CONFIGURED" ? " (no AI provider configured)" : ""
      }, so this message was checked only against deterministic rules and is not AI-verified.`
    );
  }

  if (riskLevel === "Low") {
    parts.push(
      "This does not prove the message is safe. Verify the sender through an official channel before acting on it."
    );
  } else if (riskLevel === "Medium") {
    parts.push(
      "These are suspicious indicators, not proof of fraud. Do not act on the message until you verify it independently."
    );
  } else {
    parts.push(
      "Treat this as a likely scam based on the evidence above. Do not reply, click links or send money or credentials."
    );
  }

  return parts.join(" ").slice(0, 3000);
}

async function analyzeMessage(message) {
  if (typeof message !== "string" || !message.trim()) {
    throw new AppError("A message is required.", 422, { code: "VALIDATION_ERROR" });
  }

  const normalized = message.trim();

  if (normalized.length > 5000) {
    throw new AppError("Messages must be 5000 characters or fewer.", 422, {
      code: "VALIDATION_ERROR",
    });
  }

  const indicators = getMessageIndicators(normalized);
  const heuristicScore = clampScore(
    indicators.reduce((total, item) => total + item.weight, 0)
  );

  let ai = null;
  let aiError = null;

  try {
    ai = await analyzeWithAI({
      scanType: "message",
      text: normalized,
      indicators: indicators.map((item) => item.label),
    });
  } catch (error) {
    if (!(error instanceof AiServiceError)) throw error;
    aiError = error;
  }

  const score = ai
    ? combineScores(heuristicScore, ai.riskScore)
    : heuristicScore;
  const riskLevel = classifyRisk(score);
  const isScam = isScamScore(score);

  return {
    message: normalized,
    riskScore: score,
    riskLevel,
    isScam,
    explanation: buildMessageExplanation({
      indicators,
      ai,
      aiError,
      riskLevel,
    }),
    recommendation: ai?.recommendation || buildRecommendation(riskLevel),
    detectionSource: ai ? "ai+heuristics" : "heuristic-fallback",
    verified: Boolean(ai),
    indicators,
    heuristicScore,
    aiUsed: Boolean(ai),
  };
}

module.exports = {
  analyzeMessage,
  getMessageIndicators,
  extractUrls,
};
