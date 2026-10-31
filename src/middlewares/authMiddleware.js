/**
 * Verifies the short-lived access token from the Authorization header.
 * Every private route uses this before its controller runs.
 */
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { verifyAccessToken } = require("../utils/generateToken");
const { User, RefreshToken } = require("../models");

const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("Authentication required. Please sign in.", 401, {
      code: "AUTH_REQUIRED",
    });
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    throw new AppError("Authentication required. Please sign in.", 401, {
      code: "AUTH_REQUIRED",
    });
  }

  let payload;

  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new AppError("Your access token has expired. Refresh your session.", 401, {
        code: "TOKEN_EXPIRED",
      });
    }

    throw new AppError("Invalid authentication token.", 401, {
      code: "TOKEN_INVALID",
    });
  }

  if (payload.type !== "access" || !payload.sub) {
    throw new AppError("Invalid authentication token.", 401, {
      code: "TOKEN_INVALID",
    });
  }

  const sessionId = Number.isFinite(payload.sid) ? payload.sid : null;

  const [user, session] = await Promise.all([
    User.findByPk(payload.sub),
    sessionId
      ? RefreshToken.findByPk(sessionId, {
          attributes: ["id", "userId", "revokedAt", "expiresAt"],
        })
      : null,
  ]);

  if (!user) {
    throw new AppError("This account no longer exists.", 401, {
      code: "USER_NOT_FOUND",
    });
  }

  // A signed-out device must lose API access immediately, not when its
  // 15-minute access token happens to expire. The token is only accepted while
  // the session it was issued for is still active.
  if (sessionId) {
    const sessionActive =
      session &&
      session.userId === user.id &&
      !session.revokedAt &&
      new Date(session.expiresAt).getTime() > Date.now();

    if (!sessionActive) {
      throw new AppError("Your session has ended. Please sign in again.", 401, {
        code: "SESSION_REVOKED",
      });
    }
  }

  req.user = user;
  req.userId = user.id;
  // The refresh-token row this access token belongs to, when it is known.
  req.sessionId = sessionId;

  next();
});

module.exports = { protect };
