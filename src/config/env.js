/**
 * Central environment configuration.
 *
 * Every environment variable used by the application is read here once, so the
 * rest of the code never has to remember defaults or parse strings. Calling
 * this module throws a clear error when a required value is missing, which is
 * much easier to debug than a confusing failure later.
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Always load backend/.env, even if the process was started from the repo root.
const envFile = path.resolve(__dirname, "..", "..", ".env");

dotenv.config({
  path: envFile,
  quiet: true,
});

// Some IDE terminals export PORT=0, which makes Node pick a random port while
// the frontend still calls localhost:5000. In that specific case prefer the
// PORT written in .env. Real environment values still win everywhere else.
if (!process.env.PORT || process.env.PORT === "0") {
  try {
    const filePort = dotenv.parse(fs.readFileSync(envFile)).PORT;
    if (filePort && filePort !== "0") process.env.PORT = filePort;
  } catch {
    // No readable .env; the default below applies.
  }
}

function required(name) {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }

  return value;
}

function optional(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const nodeEnv = optional("NODE_ENV", "development");
const isProduction = nodeEnv === "production";

const accessSecret = required("JWT_ACCESS_SECRET");
const refreshSecret = required("JWT_REFRESH_SECRET");

function assertStrongSecret(name, value) {
  // A short, reused or placeholder secret makes token forgery practical.
  if (value.length < 32) {
    throw new Error(
      `${name} must be at least 32 characters. Generate one with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
    );
  }

  if (/replace_with|change_me|changeme|your[-_]?secret/i.test(value)) {
    throw new Error(`${name} still contains a placeholder. Generate a real random secret.`);
  }
}

assertStrongSecret("JWT_ACCESS_SECRET", accessSecret);
assertStrongSecret("JWT_REFRESH_SECRET", refreshSecret);

if (accessSecret === refreshSecret) {
  throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.");
}

const configuredFrontendUrl = optional("FRONTEND_URL");

if (isProduction && !configuredFrontendUrl) {
  throw new Error("FRONTEND_URL is required in production (the exact frontend origin).");
}

const frontendOrigins = (configuredFrontendUrl || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

const smtpHost = optional("SMTP_HOST");
const port = toNumber(optional("PORT", "5000"), 5000);

// Port 0 makes the OS pick a random port. The frontend would then keep calling
// localhost:5000 and every login would fail with a network error. Reject it at
// startup instead of hiding the mistake.
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    `PORT must be a whole number between 1 and 65535 (received "${process.env.PORT ?? ""}"). Use PORT=5000 for local development.`
  );
}

module.exports = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === "test",
  port,
  trustProxy: toBoolean(optional("TRUST_PROXY"), false),
  frontendOrigins,

  database: {
    host: optional("DB_HOST", "localhost"),
    port: toNumber(optional("DB_PORT", "3306"), 3306),
    name: required("DB_NAME"),
    user: required("DB_USER"),
    password: optional("DB_PASSWORD"),
    logging: toBoolean(optional("DB_LOGGING"), false),
  },

  jwt: {
    accessSecret,
    refreshSecret,
    accessExpiresIn: optional("JWT_ACCESS_EXPIRES_IN", "15m"),
    refreshExpiresIn: optional("JWT_REFRESH_EXPIRES_IN", "7d"),
    issuer: "scamshield-ai",
    audience: "scamshield-web",
  },

  bcryptSaltRounds: Math.min(
    Math.max(toNumber(optional("BCRYPT_SALT_ROUNDS", "12"), 12), 10),
    15
  ),

  ai: {
    apiUrl: optional("AI_API_URL"),
    apiKey: optional("AI_API_KEY"),
    model: optional("AI_MODEL", "glm-4v-plus"),
    timeoutMs: toNumber(optional("AI_TIMEOUT_MS", "30000"), 30000),
  },

  safeBrowsingApiKey: optional("SAFE_BROWSING_API_KEY"),

  email: {
    host: smtpHost,
    port: toNumber(optional("SMTP_PORT", "587"), 587),
    secure: toBoolean(optional("SMTP_SECURE"), false),
    user: optional("SMTP_USER"),
    pass: optional("SMTP_PASS"),
    from: optional("MAIL_FROM", "ScamShield AI <no-reply@example.com>"),
    isConfigured: Boolean(smtpHost),
  },

  uploads: {
    directory: optional("UPLOAD_DIR", "uploads"),
    maxImageBytes: toNumber(optional("MAX_IMAGE_SIZE_MB", "10"), 10) * 1024 * 1024,
  },
};
