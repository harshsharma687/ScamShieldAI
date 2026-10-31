/**
 * Profile-photo storage.
 *
 * Avatars are re-encoded with sharp before they touch the disk: this strips
 * EXIF/metadata, normalises the format to WebP and guarantees the stored file
 * really is an image. Files get a random UUID name inside uploads/avatars and
 * are readable only through GET /api/avatars/:filename, which is why the URL is
 * unguessable instead of an account id other people could enumerate.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const env = require("../config/env");

const APP_ROOT = path.resolve(__dirname, "..", "..");
const UPLOAD_ROOT = path.isAbsolute(env.uploads.directory)
  ? env.uploads.directory
  : path.resolve(APP_ROOT, env.uploads.directory);
const AVATAR_DIR = path.join(UPLOAD_ROOT, "avatars");

const AVATAR_PUBLIC_PREFIX = "/api/avatars/";
const AVATAR_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

async function ensureAvatarDirectory() {
  await fs.promises.mkdir(AVATAR_DIR, { recursive: true, mode: 0o750 });
}

/** Re-encodes the upload as a square 320x320 WebP and returns its public URL. */
async function saveAvatar(buffer) {
  await ensureAvatarDirectory();

  const filename = `${crypto.randomUUID()}.webp`;
  const absolutePath = path.join(AVATAR_DIR, filename);

  await sharp(buffer)
    .rotate()
    .resize(320, 320, { fit: "cover", position: "centre" })
    .webp({ quality: 84 })
    .toFile(absolutePath);

  await fs.promises.chmod(absolutePath, 0o600).catch(() => {});

  return `${AVATAR_PUBLIC_PREFIX}${filename}`;
}

/** Returns the stored filename when a value points at one of our avatars. */
function avatarFilenameFromUrl(value) {
  if (typeof value !== "string" || !value.startsWith(AVATAR_PUBLIC_PREFIX)) {
    return null;
  }

  const filename = value.slice(AVATAR_PUBLIC_PREFIX.length);

  return AVATAR_FILENAME_PATTERN.test(filename) ? filename : null;
}

/** Resolves a filename to a path, refusing anything outside the avatar folder. */
function resolveAvatarPath(filename) {
  if (!AVATAR_FILENAME_PATTERN.test(String(filename || ""))) return null;

  return path.join(AVATAR_DIR, filename);
}

async function deleteAvatarForUrl(value) {
  const filename = avatarFilenameFromUrl(value);

  if (!filename) return false;

  try {
    await fs.promises.unlink(resolveAvatarPath(filename));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

module.exports = {
  AVATAR_PUBLIC_PREFIX,
  AVATAR_FILENAME_PATTERN,
  saveAvatar,
  avatarFilenameFromUrl,
  resolveAvatarPath,
  deleteAvatarForUrl,
};
