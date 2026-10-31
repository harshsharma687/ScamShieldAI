/**
 * Refresh-token sessions with rotation and reuse detection.
 *
 * Each refresh token is a signed JWT whose SHA-256 hash is stored in MySQL.
 * Refreshing revokes the old row and issues a new one. Presenting an already
 * revoked token is treated as theft and revokes every session for that user.
 */
const { Op } = require("sequelize");
const { sequelize, RefreshToken, User } = require("../models");
const AppError = require("../utils/AppError");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  setRefreshCookie,
  clearRefreshCookie,
} = require("../utils/generateToken");

async function revokeAllUserTokens(userId) {
  await RefreshToken.update(
    { revokedAt: new Date() },
    {
      where: {
        userId,
        revokedAt: { [Op.is]: null },
      },
    }
  );
}

/**
 * Ends every session except the one making the request. Used after a password
 * change: other devices are signed out, while the person who just proved their
 * new password stays signed in here.
 */
async function revokeOtherUserTokens(userId, keepSessionId) {
  const where = { userId, revokedAt: { [Op.is]: null } };

  if (keepSessionId) {
    where.id = { [Op.ne]: keepSessionId };
  }

  const [revokedCount] = await RefreshToken.update({ revokedAt: new Date() }, { where });

  return revokedCount;
}

/**
 * Normalises the request metadata stored next to a session. Values are
 * truncated because a browser can send an arbitrarily long User-Agent.
 */
function sessionMetadata(meta = {}) {
  const userAgent =
    typeof meta.userAgent === "string" && meta.userAgent
      ? meta.userAgent.slice(0, 255)
      : null;
  const ipAddress =
    typeof meta.ip === "string" && meta.ip ? meta.ip.slice(0, 64) : null;

  return { userAgent, ipAddress, lastUsedAt: new Date() };
}

async function createSession(user, res, meta = {}) {
  const { token, tokenHash, expiresAt } = generateRefreshToken(user);

  const session = await RefreshToken.create({
    userId: user.id,
    tokenHash,
    expiresAt,
    ...sessionMetadata(meta),
  });

  const accessToken = generateAccessToken(user, session.id);

  setRefreshCookie(res, token, expiresAt);

  return { accessToken, refreshExpiresAt: expiresAt, sessionId: session.id };
}

/**
 * Verifies and rotates a refresh token. Returns a new access token and user.
 * The caller only has to return the response.
 */
async function rotateRefreshToken(rawToken, res, meta = {}) {
  if (!rawToken) {
    throw new AppError("No refresh session was provided. Please sign in.", 401, {
      code: "REFRESH_TOKEN_MISSING",
    });
  }

  let payload;

  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    clearRefreshCookie(res);
    throw new AppError("Your session has expired. Please sign in again.", 401, {
      code: "REFRESH_TOKEN_INVALID",
    });
  }

  if (payload.type !== "refresh") {
    clearRefreshCookie(res);
    throw new AppError("Invalid session token.", 401, {
      code: "REFRESH_TOKEN_INVALID",
    });
  }

  const tokenHash = hashToken(rawToken);
  const stored = await RefreshToken.findOne({ where: { tokenHash } });

  if (!stored) {
    clearRefreshCookie(res);
    throw new AppError("Your session is no longer valid. Please sign in again.", 401, {
      code: "REFRESH_TOKEN_UNKNOWN",
    });
  }

  // A revoked token was presented again. Treat it as a stolen token and end
  // every session for this account.
  if (stored.revokedAt) {
    await revokeAllUserTokens(stored.userId);
    clearRefreshCookie(res);
    throw new AppError("This session was already used. All sessions have been signed out.", 401, {
      code: "REFRESH_TOKEN_REUSE",
    });
  }

  if (new Date(stored.expiresAt).getTime() <= Date.now()) {
    await stored.update({ revokedAt: new Date() });
    clearRefreshCookie(res);
    throw new AppError("Your session has expired. Please sign in again.", 401, {
      code: "REFRESH_TOKEN_EXPIRED",
    });
  }

  const user = await User.findByPk(stored.userId);

  if (!user) {
    await stored.update({ revokedAt: new Date() });
    clearRefreshCookie(res);
    throw new AppError("This account no longer exists.", 401, {
      code: "USER_NOT_FOUND",
    });
  }

  const next = generateRefreshToken(user);
  let raceDetected = false;
  let nextSession = null;

  try {
    await sequelize.transaction(async (transaction) => {
      // The conditional update makes rotation atomic. If two requests race,
      // only one can change revoked_at from NULL.
      const [affected] = await RefreshToken.update(
        { revokedAt: new Date() },
        {
          where: { id: stored.id, revokedAt: { [Op.is]: null } },
          transaction,
        }
      );

      if (affected !== 1) {
        raceDetected = true;
        throw new Error("REFRESH_ROTATION_RACE");
      }

      nextSession = await RefreshToken.create(
        {
          userId: user.id,
          tokenHash: next.tokenHash,
          expiresAt: next.expiresAt,
          ...sessionMetadata(meta),
        },
        { transaction }
      );
    });
  } catch (error) {
    if (raceDetected || error.message === "REFRESH_ROTATION_RACE") {
      await revokeAllUserTokens(user.id);
      clearRefreshCookie(res);
      throw new AppError("This session was already used. Please sign in again.", 401, {
        code: "REFRESH_TOKEN_REUSE",
      });
    }
    throw error;
  }

  setRefreshCookie(res, next.token, next.expiresAt);

  return {
    user,
    accessToken: generateAccessToken(user, nextSession?.id ?? null),
    refreshExpiresAt: next.expiresAt,
    sessionId: nextSession?.id ?? null,
  };
}

/**
 * Ends one session by its row id. Used by logout when the refresh cookie is
 * unavailable but the access token still identifies the session.
 *
 * The row is deleted rather than marked revoked, so a stale tab that tries to
 * refresh afterwards gets "session no longer valid" instead of being treated
 * as a stolen-token replay (which would sign every other device out too).
 */
async function revokeSessionById(sessionId) {
  if (!sessionId) return false;

  const deleted = await RefreshToken.destroy({ where: { id: sessionId } });

  return deleted > 0;
}

async function revokeRefreshToken(rawToken) {
  if (!rawToken) return false;

  const deleted = await RefreshToken.destroy({
    where: { tokenHash: hashToken(rawToken) },
  });

  return deleted > 0;
}

module.exports = {
  createSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeSessionById,
  revokeAllUserTokens,
  revokeOtherUserTokens,
};
