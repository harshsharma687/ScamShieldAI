const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const env = require("../config/env");
const fs = require("fs");
const { User, Scan, DetectionResult, RefreshToken } = require("../models");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { hashToken, clearRefreshCookie } = require("../utils/generateToken");
const { revokeAllUserTokens } = require("../services/refreshTokenService");
const {
  isEmailConfigured,
  sendEmailChangeVerification,
  sendPasswordChangedNotice,
} = require("../services/emailService");
const { serializeUser, serializeScan } = require("../utils/serializers");
const { deleteUpload, detectImageType } = require("../utils/fileStorage");
const {
  saveAvatar,
  avatarFilenameFromUrl,
  resolveAvatarPath,
  deleteAvatarForUrl,
} = require("../services/avatarService");

function normalizeProfileImage(value) {
  if (value === null || value === "") return null;

  // Avatars uploaded through Settings are stored as an internal path.
  if (avatarFilenameFromUrl(value)) return value;

  let parsed;

  try {
    parsed = new URL(String(value));
  } catch {
    throw new AppError("Profile image must be a valid http(s) URL.", 422, {
      code: "VALIDATION_ERROR",
    });
  }

  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new AppError("Profile image must be a valid http(s) URL.", 422, {
      code: "VALIDATION_ERROR",
    });
  }

  return parsed.href.slice(0, 2048);
}

const getProfile = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Profile loaded.", {
    user: serializeUser(req.user),
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const user = req.user;
  const { name, email, profileImage, currentPassword } = req.body;

  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : null;
  const wantsEmailChange = Boolean(normalizedEmail && normalizedEmail !== user.email);

  if (wantsEmailChange && !isEmailConfigured()) {
    throw new AppError(
      "Changing your email requires email delivery to be configured on this server.",
      503,
      { code: "EMAIL_NOT_CONFIGURED" }
    );
  }

  if (wantsEmailChange && !currentPassword) {
    throw new AppError(
      "Enter your current password to change your email address.",
      400,
      { code: "CURRENT_PASSWORD_REQUIRED" }
    );
  }

  if (wantsEmailChange) {
    const passwordMatches = await bcrypt.compare(currentPassword, user.password);

    if (!passwordMatches) {
      throw new AppError("Current password is incorrect.", 401, {
        code: "INVALID_CURRENT_PASSWORD",
      });
    }

    const existing = await User.findOne({
      where: {
        email: normalizedEmail,
        id: { [Op.ne]: user.id },
      },
    });

    if (existing) {
      throw new AppError("That email address is already in use.", 409, {
        code: "EMAIL_IN_USE",
      });
    }
  }

  if (typeof name === "string" && name.trim()) {
    user.name = name.trim();
  }

  if (profileImage !== undefined) {
    const previousImage = user.profileImage;
    const nextImage = normalizeProfileImage(profileImage);

    user.profileImage = nextImage;

    // Replacing an uploaded photo with a URL (or removing it) leaves the old
    // file behind otherwise.
    if (previousImage && previousImage !== nextImage) {
      await deleteAvatarForUrl(previousImage).catch(() => {});
    }
  }

  let verificationToken = null;

  if (wantsEmailChange) {
    verificationToken = crypto.randomBytes(32).toString("hex");

    user.pendingEmail = normalizedEmail;
    user.emailChangeTokenHash = hashToken(verificationToken);
    user.emailChangeExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  }

  await user.save();

  if (wantsEmailChange && verificationToken) {
    try {
      await sendEmailChangeVerification({
        to: normalizedEmail,
        name: user.name,
        token: verificationToken,
      });
    } catch {
      // Do not leave a pending address behind if the email could not be sent.
      user.pendingEmail = null;
      user.emailChangeTokenHash = null;
      user.emailChangeExpiresAt = null;
      await user.save();

      throw new AppError(
        "The verification email could not be sent. Your email was not changed.",
        503,
        { code: "EMAIL_DELIVERY_FAILED" }
      );
    }
  }

  return sendSuccess(
    res,
    200,
    wantsEmailChange
      ? "Profile updated. Check the new email address to confirm the change."
      : "Profile updated successfully.",
    {
      user: serializeUser(user),
      emailChangePending: wantsEmailChange,
    }
  );
});


const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = req.user;

  const matches = await bcrypt.compare(currentPassword, user.password);

  if (!matches) {
    throw new AppError("Current password is incorrect.", 401, {
      code: "INVALID_CURRENT_PASSWORD",
    });
  }

  const samePassword = await bcrypt.compare(newPassword, user.password);

  if (samePassword) {
    throw new AppError("New password must be different from your current password.", 422, {
      code: "PASSWORD_UNCHANGED",
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, env.bcryptSaltRounds);

  await user.update({ password: passwordHash });
  await revokeAllUserTokens(user.id);
  clearRefreshCookie(res);

  if (isEmailConfigured()) {
    sendPasswordChangedNotice({ to: user.email, name: user.name }).catch(() => {
      // The password is already changed; a failed notification must not turn a
      // successful change into an error response.
    });
  }

  return sendSuccess(
    res,
    200,
    "Password changed successfully. Other sessions have been signed out."
  );
});

const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const user = req.user;

  const matches = await bcrypt.compare(password, user.password);

  if (!matches) {
    throw new AppError("Password is incorrect.", 401, {
      code: "INVALID_CURRENT_PASSWORD",
    });
  }

  const scans = await Scan.findAll({
    where: { userId: user.id },
    attributes: ["id", "fileUrl"],
  });
  const previousImage = user.profileImage;

  // Foreign keys cascade: scans, detection results and refresh tokens are
  // removed with the account.
  await user.destroy();

  await Promise.allSettled(
    scans.filter((scan) => scan.fileUrl).map((scan) => deleteUpload(scan.fileUrl))
  );
  await deleteAvatarForUrl(previousImage).catch(() => {});

  clearRefreshCookie(res);

  return sendSuccess(res, 200, "Your account and scan history have been deleted.");
});

/* -------------------------------------------------------------------------
 * Profile photo
 * ---------------------------------------------------------------------- */

const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file?.buffer?.length) {
    throw new AppError("Choose a JPG or PNG image to upload.", 422, {
      code: "AVATAR_REQUIRED",
    });
  }

  // The browser-declared MIME type and the filename are never trusted.
  if (!detectImageType(req.file.buffer)) {
    throw new AppError("That file is not a valid JPG or PNG image.", 422, {
      code: "INVALID_IMAGE_TYPE",
    });
  }

  const user = req.user;
  const previousImage = user.profileImage;
  const profileImage = await saveAvatar(req.file.buffer);

  await user.update({ profileImage });

  if (previousImage && previousImage !== profileImage) {
    await deleteAvatarForUrl(previousImage).catch(() => {});
  }

  return sendSuccess(res, 200, "Profile photo updated.", {
    user: serializeUser(user),
  });
});

const removeAvatar = asyncHandler(async (req, res) => {
  const user = req.user;
  const previousImage = user.profileImage;

  await user.update({ profileImage: null });
  await deleteAvatarForUrl(previousImage).catch(() => {});

  return sendSuccess(res, 200, "Profile photo removed.", {
    user: serializeUser(user),
  });
});

/**
 * Public read-only route for stored avatars. Filenames are random UUIDs, so a
 * photo cannot be found by guessing an account id.
 */
const serveAvatar = asyncHandler(async (req, res) => {
  const absolutePath = resolveAvatarPath(req.params.filename);

  if (!absolutePath) {
    throw new AppError("Profile photo not found.", 404, { code: "AVATAR_NOT_FOUND" });
  }

  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
  } catch {
    throw new AppError("Profile photo not found.", 404, { code: "AVATAR_NOT_FOUND" });
  }

  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type("image/webp");

  return res.sendFile(absolutePath);
});

/* -------------------------------------------------------------------------
 * Active sessions
 * ---------------------------------------------------------------------- */

/** A short, human-readable device label built from the User-Agent header. */
function describeDevice(userAgent) {
  if (!userAgent) return "Unknown device";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent) || /CriOS/.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";

  const system = /Windows NT/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iPod/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";

  return system ? `${browser} on ${system}` : browser;
}

function serializeSession(session, currentId) {
  return {
    id: session.id,
    device: describeDevice(session.userAgent),
    ipAddress: session.ipAddress || null,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt || session.createdAt,
    expiresAt: session.expiresAt,
    current: currentId ? session.id === currentId : false,
  };
}

const listSessions = asyncHandler(async (req, res) => {
  const sessions = await RefreshToken.findAll({
    where: {
      userId: req.userId,
      revokedAt: { [Op.is]: null },
      expiresAt: { [Op.gt]: new Date() },
    },
    order: [["createdAt", "DESC"]],
    limit: 50,
  });

  return sendSuccess(res, 200, "Active sessions loaded.", {
    sessions: sessions.map((session) => serializeSession(session, req.sessionId)),
  });
});

const revokeSession = asyncHandler(async (req, res) => {
  const session = await RefreshToken.findOne({
    where: { id: req.params.id, userId: req.userId, revokedAt: { [Op.is]: null } },
  });

  if (!session) {
    throw new AppError("That session is no longer active.", 404, {
      code: "SESSION_NOT_FOUND",
    });
  }

  if (req.sessionId && session.id === req.sessionId) {
    throw new AppError(
      "This is the session you are using. Use Sign out instead.",
      400,
      { code: "CANNOT_REVOKE_CURRENT_SESSION" }
    );
  }

  await session.update({ revokedAt: new Date() });

  return sendSuccess(res, 200, "That device has been signed out.", {
    id: session.id,
  });
});

const revokeOtherSessions = asyncHandler(async (req, res) => {
  const where = { userId: req.userId, revokedAt: { [Op.is]: null } };

  if (req.sessionId) {
    where.id = { [Op.ne]: req.sessionId };
  }

  const revokedCount = await RefreshToken.update({ revokedAt: new Date() }, { where });

  return sendSuccess(
    res,
    200,
    revokedCount > 0
      ? `${revokedCount} other session${revokedCount === 1 ? "" : "s"} signed out.`
      : "No other active sessions were found.",
    { revokedCount }
  );
});

/* -------------------------------------------------------------------------
 * Data export
 * ---------------------------------------------------------------------- */

const exportData = asyncHandler(async (req, res) => {
  const scans = await Scan.findAll({
    where: { userId: req.userId },
    include: [{ model: DetectionResult, as: "detectionResults" }],
    order: [["createdAt", "DESC"]],
    limit: 1000,
  });

  const exportedAt = new Date();

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="scamshield-data-${exportedAt.toISOString().slice(0, 10)}.json"`
  );

  return sendSuccess(res, 200, "Account data exported.", {
    exportedAt: exportedAt.toISOString(),
    account: serializeUser(req.user),
    scanCount: scans.length,
    scans: scans.map(serializeScan),
  });
});

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  uploadAvatar,
  removeAvatar,
  serveAvatar,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  exportData,
};
