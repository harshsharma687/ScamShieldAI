/**
 * URL scam detection.
 *
 * Security decisions:
 *  - The submitted URL is NEVER fetched. ScamShield only parses it and, when a
 *    key is configured, asks Google Safe Browsing about it. This removes the
 *    SSRF risk of "visit this URL to check it".
 *  - localhost, private, link-local and numeric IP destinations are rejected.
 *  - Only http/https is accepted.
 *  - The AI provider is optional. Without it, deterministic checks run and the
 *    result is explicitly labelled as not AI-verified.
 */
const net = require("net");
const axios = require("axios");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const { analyzeWithAI, AiServiceError } = require("./aiDetectionService");
const {
  clampScore,
  combineScores,
  classifyRisk,
  isScamScore,
  buildRecommendation,
} = require("../utils/risk");

const SHORTENER_DOMAINS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "is.gd",
  "buff.ly",
  "ow.ly",
  "cutt.ly",
  "rb.gy",
  "shorturl.at",
  "rebrand.ly",
  "tiny.cc",
  "bit.do",
  "short.io",
  "t.ly",
  "me2.do",
  "shorte.st",
  "adf.ly",
  "bc.vc",
]);

const SUSPICIOUS_TLDS = new Set([
  "zip",
  "mov",
  "top",
  "xyz",
  "click",
  "link",
  "gq",
  "tk",
  "ml",
  "ga",
  "cf",
  "work",
  "support",
  "rest",
  "cam",
  "buzz",
  "monster",
  "sbs",
  "icu",
  "cyou",
  "quest",
  "lol",
  "fit",
  "best",
  "buzz",
  "surf",
  "bar",
  "click",
]);

const BRAND_NAMES = [
  "paypal",
  "amazon",
  "apple",
  "microsoft",
  "google",
  "facebook",
  "instagram",
  "whatsapp",
  "netflix",
  "coinbase",
  "binance",
  "chase",
  "wellsfargo",
  "bankofamerica",
  "sbi",
  "hdfc",
  "icici",
  "axis",
  "paytm",
  "phonepe",
  "irs",
  "incometax",
  "customs",
];

const SCAM_KEYWORDS = [
  "login",
  "signin",
  "verify",
  "verification",
  "secure",
  "account",
  "update",
  "wallet",
  "payment",
  "invoice",
  "prize",
  "winner",
  "gift",
  "free",
  "claim",
  "bonus",
  "crypto",
  "bitcoin",
  "ethereum",
  "giveaway",
  "recovery",
  "support",
  "unlock",
  "suspended",
  "confirm",
  "kyc",
  "refund",
  "otp",
];

const MULTI_PART_SUFFIXES = new Set([
  "co.in",
  "co.uk",
  "co.jp",
  "co.za",
  "co.ke",
  "co.nz",
  "com.au",
  "com.br",
  "com.mx",
  "com.sg",
  "com.ng",
  "com.pk",
  "com.tr",
  "com.ar",
  "net.au",
  "org.uk",
  "gov.uk",
  "ac.uk",
]);

function isPrivateIpv4(host) {
  const parts = host.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function numericHostToIpv4(host) {
  let value = null;

  if (/^\d+$/.test(host)) value = Number(host);
  else if (/^0x[0-9a-f]+$/i.test(host)) value = parseInt(host, 16);

  if (!Number.isFinite(value) || value < 0 || value > 0xffffffff) return null;

  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

function isPrivateOrLocalHost(hostname) {
  const host = String(hostname)
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) {
    return true;
  }

  const version = net.isIP(host);

  if (version === 4) return isPrivateIpv4(host);

  if (version === 6) {
    if (host === "::1" || host === "::" || host === "0:0:0:0:0:0:0:1") return true;
    if (host.startsWith("::ffff:")) {
      const mapped = host.slice(7);
      if (net.isIP(mapped) === 4) return isPrivateIpv4(mapped);
    }
    if (/^f[cd][0-9a-f:]*$/i.test(host)) return true; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f:]*$/i.test(host)) return true; // fe80::/10 link local
  }

  // Some browsers accept a single decimal/hex number as an IPv4 address.
  const numericIp = numericHostToIpv4(host);
  if (numericIp && isPrivateIpv4(numericIp)) return true;

  return false;
}

function normalizeUrl(input) {
  if (typeof input !== "string") {
    throw new AppError("Please provide a URL as text.", 422, { code: "VALIDATION_ERROR" });
  }

  let raw = input.trim();

  if (!raw) {
    throw new AppError("A website URL is required.", 422, { code: "VALIDATION_ERROR" });
  }

  if (raw.length > 2048) {
    throw new AppError("The URL is too long. Maximum length is 2048 characters.", 422, {
      code: "VALIDATION_ERROR",
    });
  }

  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    throw new AppError("The URL contains invalid control characters.", 422, {
      code: "VALIDATION_ERROR",
    });
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  let parsed;

  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError(
      "Invalid URL. Enter a complete address such as https://example.com.",
      422,
      { code: "INVALID_URL" }
    );
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError("Only HTTP and HTTPS links are supported.", 422, {
      code: "INVALID_URL_SCHEME",
    });
  }

  if (parsed.username || parsed.password) {
    throw new AppError("URLs containing embedded usernames or passwords are not allowed.", 400, {
      code: "URL_CREDENTIALS_BLOCKED",
    });
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!hostname) {
    throw new AppError("The URL must include a website hostname.", 422, {
      code: "INVALID_URL",
    });
  }

  if (isPrivateOrLocalHost(hostname)) {
    throw new AppError(
      "ScamShield does not check localhost, private-network or internal addresses.",
      400,
      { code: "BLOCKED_DESTINATION" }
    );
  }

  // The fragment is never sent to a server and adds no reputation value.
  parsed.hash = "";

  if (parsed.href.length > 2048) {
    throw new AppError("The normalized URL is too long.", 422, {
      code: "VALIDATION_ERROR",
    });
  }

  return parsed;
}

function getRegistrableDomain(hostname) {
  const labels = hostname.split(".").filter(Boolean);

  if (labels.length <= 2) return labels.join(".");

  const lastTwo = labels.slice(-2).join(".");

  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }

  return lastTwo;
}

/**
 * Pure, deterministic URL checks. Exported so message analysis can reuse them.
 * Returns a de-duplicated list of { code, label, weight }.
 */
function getUrlIndicators(parsedUrl) {
  const indicators = [];
  const seen = new Set();

  function add(code, label, weight) {
    if (seen.has(code)) return;
    seen.add(code);
    indicators.push({ code, label, weight });
  }

  const hostname = parsedUrl.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const pathAndQuery = `${parsedUrl.pathname}${parsedUrl.search}`.toLowerCase();
  const labels = hostname.split(".").filter(Boolean);
  const tld = labels[labels.length - 1] || "";
  const registrable = getRegistrableDomain(hostname);

  if (parsedUrl.protocol === "http:") {
    add("http", "Uses unencrypted HTTP", 10);
  }

  if (net.isIP(hostname.replace(/^\[|\]$/g, "")) || numericHostToIpv4(hostname)) {
    add("ip-host", "Uses a raw IP address instead of a domain name", 25);
  }

  if (hostname.includes("xn--")) {
    add("punycode", "Uses a punycode (internationalized) domain that can imitate a brand", 20);
  }

  if (hostname.includes("%") || pathAndQuery.includes("%40")) {
    add("encoded", "Contains encoded characters often used to hide the destination", 12);
  }

  if (SHORTENER_DOMAINS.has(registrable) || SHORTENER_DOMAINS.has(hostname)) {
    add("shortener", "Uses a link-shortening service that hides the real destination", 25);
  }

  if (SUSPICIOUS_TLDS.has(tld)) {
    add("suspicious-tld", `Uses a TLD frequently abused for scams (.${tld})`, 15);
  }

  const keywordHits = SCAM_KEYWORDS.filter(
    (keyword) => hostname.includes(keyword) || pathAndQuery.includes(keyword)
  );

  if (keywordHits.length) {
    add(
      "scam-keywords",
      `Contains urgency/credential keywords: ${keywordHits.slice(0, 5).join(", ")}`,
      Math.min(24, keywordHits.length * 6)
    );
  }

  const brandHit = BRAND_NAMES.find(
    (brand) =>
      (hostname.includes(brand) || pathAndQuery.includes(brand)) &&
      !registrable.startsWith(brand) &&
      !registrable.split(".").includes(brand)
  );

  if (brandHit) {
    add(
      "brand-impersonation",
      `Mentions the brand "${brandHit}" on an unrelated domain`,
      30
    );
  }

  if (labels.length >= 5) {
    add("subdomains", "Uses an unusually deep subdomain chain", 10);
  }

  if ((hostname.match(/-/g) || []).length >= 3) {
    add("hyphens", "Hostname contains many hyphens", 6);
  }

  if (hostname.length > 40) {
    add("long-host", "Hostname is unusually long", 5);
  }

  if (parsedUrl.href.length > 150) {
    add("long-url", "URL is unusually long", 5);
  }

  if (parsedUrl.port && !["", "80", "443"].includes(parsedUrl.port)) {
    add("nonstandard-port", `Uses a non-standard port (${parsedUrl.port})`, 15);
  }

  if (/\.(zip|mov|exe|apk|scr|bat|cmd)$/i.test(parsedUrl.pathname)) {
    add("dangerous-extension", "Path ends with a file type often used to deliver malware", 12);
  }

  if (/(?:^|[?&])(?:url|redirect|next|target|continue)=/i.test(parsedUrl.search)) {
    add("redirect-param", "Contains a redirect parameter that can hide the final destination", 8);
  }

  if (/@/.test(pathAndQuery)) {
    add("at-sign", "Contains an @ symbol in the path or query", 8);
  }

  if (/\d{5,}/.test(hostname)) {
    add("digits", "Hostname contains a long numeric sequence", 5);
  }

  return indicators;
}

function scoreIndicators(indicators) {
  return clampScore(indicators.reduce((total, item) => total + item.weight, 0));
}

/**
 * Optional real threat-intelligence check. No key means no blacklist claim is
 * made; the response explicitly says the check was unavailable.
 */
async function checkSafeBrowsing(url) {
  if (!env.safeBrowsingApiKey) {
    return { checked: false, matched: false, threatTypes: [] };
  }

  try {
    const response = await axios.post(
      "https://safebrowsing.googleapis.com/v4/threatMatches:find",
      {
        client: { clientId: "scamshield-ai", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          entryPoints: ["URL"],
          threatEntries: [{ url }],
        },
      },
      {
        params: { key: env.safeBrowsingApiKey },
        timeout: 6000,
        maxBodyLength: Infinity,
      }
    );

    const matches = Array.isArray(response.data?.matches) ? response.data.matches : [];

    return {
      checked: true,
      matched: matches.length > 0,
      threatTypes: [...new Set(matches.map((match) => match.threatType).filter(Boolean))],
    };
  } catch {
    // Never log the URL or the API key. An unavailable blacklist is not proof
    // of safety and is reported as such.
    console.warn("[threat-intel] Google Safe Browsing check failed");
    return { checked: false, matched: false, threatTypes: [] };
  }
}

function buildUrlExplanation({ indicators, ai, aiError, threatIntel, level }) {
  const parts = [];

  if (threatIntel.matched) {
    parts.push(
      `Google Safe Browsing matched this URL as a known threat${
        threatIntel.threatTypes.length ? ` (${threatIntel.threatTypes.join(", ")})` : ""
      }.`
    );
  } else if (threatIntel.checked) {
    parts.push("Google Safe Browsing returned no known threat match.");
  } else {
    parts.push("The blacklist check was not available, so no reputation claim is made.");
  }

  if (indicators.length) {
    parts.push(`Deterministic URL checks found: ${indicators.map((item) => item.label).join("; ")}.`);
  } else {
    parts.push("Deterministic URL checks found no structural warning signs.");
  }

  if (ai) {
    parts.push(`AI analysis: ${ai.explanation}`);
  } else {
    parts.push(
      `AI analysis was unavailable${
        aiError?.code === "AI_NOT_CONFIGURED" ? " (no AI provider configured)" : ""
      }, so this verdict is based only on deterministic checks and is not AI-verified.`
    );
  }

  if (level === "Low") {
    parts.push(
      "A low score does not prove the website is safe. Never enter credentials or payment details unless you independently trust the site."
    );
  } else {
    parts.push("This is an automated risk assessment, not a legal or financial guarantee.");
  }

  return parts.join(" ").slice(0, 3000);
}

async function analyzeUrl(rawUrl) {
  const parsedUrl = normalizeUrl(rawUrl);
  const indicators = getUrlIndicators(parsedUrl);
  const heuristicScore = scoreIndicators(indicators);

  const [threatIntel, aiResult] = await Promise.all([
    checkSafeBrowsing(parsedUrl.href),
    analyzeWithAI({
      scanType: "link",
      url: parsedUrl.href,
      indicators: indicators.map((item) => item.label),
    }).then(
      (value) => ({ ai: value, error: null }),
      (error) => {
        if (!(error instanceof AiServiceError)) {
          throw error;
        }
        return { ai: null, error };
      }
    ),
  ]);

  let score = heuristicScore;

  if (threatIntel.matched) {
    score = 100;
  } else if (aiResult.ai) {
    score = combineScores(heuristicScore, aiResult.ai.riskScore);
  }

  const riskLevel = classifyRisk(score);
  const isScam = isScamScore(score) || threatIntel.matched;
  const recommendation =
    aiResult.ai?.recommendation || buildRecommendation(riskLevel);

  const detectionSource = threatIntel.matched
    ? aiResult.ai
      ? "threat-intel+ai+heuristics"
      : "threat-intel+heuristics"
    : aiResult.ai
      ? "ai+heuristics"
      : "heuristic-fallback";

  return {
    normalizedUrl: parsedUrl.href,
    riskScore: score,
    riskLevel,
    isScam,
    explanation: buildUrlExplanation({
      indicators,
      ai: aiResult.ai,
      aiError: aiResult.error,
      threatIntel,
      level: riskLevel,
    }),
    recommendation,
    detectionSource,
    verified: Boolean(aiResult.ai || threatIntel.checked),
    indicators,
    heuristicScore,
    aiUsed: Boolean(aiResult.ai),
    threatIntel,
  };
}

module.exports = {
  normalizeUrl,
  getUrlIndicators,
  scoreIndicators,
  isPrivateOrLocalHost,
  checkSafeBrowsing,
  analyzeUrl,
};
