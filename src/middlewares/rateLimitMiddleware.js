/**
 * Brute-force and abuse protection. Limits are per IP address.
 * In tests the limits are skipped so assertions are deterministic.
 */
const rateLimitModule = require("express-rate-limit");
const env = require("../config/env");
const { sendError } = require("../utils/apiResponse");

const rateLimit =
  rateLimitModule.rateLimit || rateLimitModule.default || rateLimitModule;

function handler(message) {
  return (req, res) => sendError(res, 429, message, undefined, "RATE_LIMITED");
}

const common = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.isTest,
};

const generalLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  handler: handler("Too many requests. Please try again later."),
});

const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  handler: handler("Too many login attempts. Please wait 15 minutes and try again."),
});

const registerLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  handler: handler("Too many accounts were created from this address. Try again later."),
});

const passwordResetLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  handler: handler("Too many password-reset requests. Try again in an hour."),
});

const refreshLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 60,
  handler: handler("Too many session refresh attempts. Please sign in again."),
});

const scanLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  handler: handler("Scan limit reached. Please wait a few minutes before scanning again."),
});

module.exports = {
  generalLimiter,
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  refreshLimiter,
  scanLimiter,
};
