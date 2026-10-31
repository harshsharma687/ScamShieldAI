/**
 * JWT + refresh-token helpers.
 *
 * Access token  : short-lived (default 15 minutes), sent in the Authorization header.
 * Refresh token : long-lived (default 7 days), stored in an HTTP-only cookie and
 *                 hashed in MySQL so it can be revoked and rotated.
 */
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

const REFRESH_COOKIE_NAME = "scamshield_refresh";
const REFRESH_COOKIE_PATH = "/api/auth";

/**
 * `sessionId` is the refresh-token row this access token belongs to. It lets a
 * request know which session it came from (used by the Settings "active
 * sessions" list) without reading the refresh cookie.
 */
function generateAccessToken(user, sessionId = null) {
  return jwt.sign(
    { sub: String(user.id), type: "access", ...(sessionId ? { sid: sessionId } : {}) },
    env.jwt.accessSecret,
    {
      expiresIn: env.jwt.accessExpiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    }
  );
}

function generateRefreshToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { sub: String(user.id), type: "refresh", jti },
    env.jwt.refreshSecret,
    {
      expiresIn: env.jwt.refreshExpiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    }
  );

  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000);

  return { token, tokenHash: hashToken(token), expiresAt };
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, {
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret, {
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });
}

/** Raw tokens are never persisted; only their SHA-256 digest is. */
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function refreshCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? "none" : "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  };
}

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(expiresAt));
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? "none" : "lax",
    path: REFRESH_COOKIE_PATH,
  });
}

module.exports = {
  REFRESH_COOKIE_NAME,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  setRefreshCookie,
  clearRefreshCookie,
};
