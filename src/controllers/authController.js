const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const env = require("../config/env");
const { User } = require("../models");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { hashToken, clearRefreshCookie, REFRESH_COOKIE_NAME } = require("../utils/generateToken");
const {
  createSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} = require("../services/refreshTokenService");
const {
  isEmailConfigured,
  sendPasswordResetEmail,
} = require("../services/emailService");
const { serializeUser } = require("../utils/serializers");

/** Device details stored with a session so Settings can list it later. */
function requestMeta(req) {
  return {
    userAgent: req.get("user-agent") || null,
    ip: req.ip || null,
  };
}

let dummyHashPromise = null;

/**
 * Comparing against a dummy hash keeps failed-login timing close to a real
 * account lookup, which makes account enumeration harder.
 */
async function compareDummyPassword(password) {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash("not-a-real-account-password", env.bcryptSaltRounds);
  }

  await bcrypt.compare(password, await dummyHashPromise);
}

const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ where: { email } });

  if (existing) {
    throw new AppError("An account with this email already exists.", 409, {
      code: "EMAIL_IN_USE",
    });
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  const user = await User.create({ name, email, password: passwordHash });
  const session = await createSession(user, res, requestMeta(req));

  return sendSuccess(res, 201, "Account created successfully.", {
    user: serializeUser(user),
    accessToken: session.accessToken,
    tokenType: "Bearer",
    accessTokenExpiresIn: env.jwt.accessExpiresIn,
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email } });

  if (!user) {
    await compareDummyPassword(password);
    throw new AppError("Invalid email or password.", 401, {
      code: "INVALID_CREDENTIALS",
    });
  }

  const matches = await bcrypt.compare(password, user.password);

  if (!matches) {
    throw new AppError("Invalid email or password.", 401, {
      code: "INVALID_CREDENTIALS",
    });
  }

  const session = await createSession(user, res, requestMeta(req));

  return sendSuccess(res, 200, "Signed in successfully.", {
    user: serializeUser(user),
    accessToken: session.accessToken,
    tokenType: "Bearer",
    accessTokenExpiresIn: env.jwt.accessExpiresIn,
  });
});

const refresh = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  const session = await rotateRefreshToken(rawToken, res, requestMeta(req));

  return sendSuccess(res, 200, "Session refreshed.", {
    user: serializeUser(session.user),
    accessToken: session.accessToken,
    tokenType: "Bearer",
    accessTokenExpiresIn: env.jwt.accessExpiresIn,
  });
});

const logout = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (rawToken) {
    await revokeRefreshToken(rawToken);
  }

  clearRefreshCookie(res);

  return sendSuccess(res, 200, "Signed out successfully.");
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!isEmailConfigured()) {
    throw new AppError(
      "Password-reset email is not configured on this server. Ask the administrator to set the SMTP variables.",
      503,
      { code: "EMAIL_NOT_CONFIGURED" }
    );
  }

  const user = await User.findOne({ where: { email } });

  // Always return the same message so the endpoint cannot be used to discover
  // which email addresses have accounts.
  const genericMessage =
    "If an account exists for that email, a password-reset link has been sent.";

  if (!user) {
    return sendSuccess(res, 200, genericMessage);
  }

  const token = crypto.randomBytes(32).toString("hex");

  await user.update({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  try {
    await sendPasswordResetEmail({ to: user.email, name: user.name, token });
  } catch (error) {
    await user.update({
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    });

    throw new AppError(
      "The reset email could not be sent. Please try again later.",
      503,
      { code: "EMAIL_DELIVERY_FAILED" }
    );
  }

  return sendSuccess(res, 200, genericMessage);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findOne({
    where: {
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { [Op.gt]: new Date() },
    },
  });

  if (!user) {
    throw new AppError("This password-reset link is invalid or has expired.", 400, {
      code: "RESET_TOKEN_INVALID",
    });
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

  await user.update({
    password: passwordHash,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
  });

  // A password reset signs out every existing session.
  await revokeAllUserTokens(user.id);
  clearRefreshCookie(res);

  return sendSuccess(
    res,
    200,
    "Password reset successfully. Sign in with your new password."
  );
});

const verifyEmailChange = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findOne({
    where: {
      emailChangeTokenHash: hashToken(token),
      emailChangeExpiresAt: { [Op.gt]: new Date() },
    },
  });

  if (!user || !user.pendingEmail) {
    throw new AppError("This email-verification link is invalid or has expired.", 400, {
      code: "VERIFICATION_TOKEN_INVALID",
    });
  }

  const taken = await User.findOne({
    where: {
      email: user.pendingEmail,
      id: { [Op.ne]: user.id },
    },
  });

  if (taken) {
    throw new AppError("That email address is already in use.", 409, {
      code: "EMAIL_IN_USE",
    });
  }

  const newEmail = user.pendingEmail;

  await user.update({
    email: newEmail,
    pendingEmail: null,
    emailChangeTokenHash: null,
    emailChangeExpiresAt: null,
  });

  // Changing the sign-in address invalidates existing refresh sessions.
  await revokeAllUserTokens(user.id);
  clearRefreshCookie(res);

  return sendSuccess(res, 200, "Email address confirmed.", {
    user: serializeUser(user),
  });
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Current user loaded.", {
    user: serializeUser(req.user),
  });
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmailChange,
  getCurrentUser,
};
