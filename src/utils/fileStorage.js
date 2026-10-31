/**
 * Secure upload helpers.
 *
 * Files are written with a random name inside the uploads directory. The
 * client's original filename is never used on disk, which prevents path
 * traversal and extension spoofing. Uploads are never served as static files.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const env = require("../config/env");
const AppError = require("./AppError");

const APP_ROOT = path.resolve(__dirname, "..", "..");
const UPLOAD_ROOT = path.isAbsolute(env.uploads.directory)
  ? env.uploads.directory
  : path.resolve(APP_ROOT, env.uploads.directory);

const IMAGE_TYPES = {
  jpeg: { mime: "image/jpeg", extension: "jpg" },
  png: { mime: "image/png", extension: "png" },
};

async function ensureUploadDirectory() {
  await fs.promises.mkdir(UPLOAD_ROOT, { recursive: true, mode: 0o750 });
}

/**
 * Checks the file's magic bytes, not its extension or the browser-provided MIME
 * type. A .jpg file containing an HTML or executable payload is rejected.
 */
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return IMAGE_TYPES.png;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return IMAGE_TYPES.jpeg;
  }

  return null;
}

async function saveImageBuffer(buffer, extension) {
  await ensureUploadDirectory();

  const filename = `${crypto.randomUUID()}.${extension}`;
  const absolutePath = path.join(UPLOAD_ROOT, filename);

  await fs.promises.writeFile(absolutePath, buffer, {
    mode: 0o600,
    flag: "wx",
  });

  return {
    filename,
    absolutePath,
    // Store a path relative to the backend when possible, or an absolute path
    // when UPLOAD_DIR points outside the project.
    relativePath: path
      .relative(APP_ROOT, absolutePath)
      .split(path.sep)
      .join("/"),
  };
}

/**
 * Resolves a stored relative path and refuses anything outside UPLOAD_ROOT.
 * Guards against a corrupted or malicious database value.
 */
function resolveUploadPath(relativePath) {
  if (!relativePath) return null;

  const stored = String(relativePath);
  const absolutePath = path.isAbsolute(stored)
    ? path.normalize(stored)
    : path.resolve(APP_ROOT, stored);
  const rootWithSeparator = UPLOAD_ROOT.endsWith(path.sep)
    ? UPLOAD_ROOT
    : UPLOAD_ROOT + path.sep;

  if (
    absolutePath !== UPLOAD_ROOT &&
    !absolutePath.startsWith(rootWithSeparator)
  ) {
    return null;
  }

  return absolutePath;
}

async function deleteUpload(relativePath) {
  const absolutePath = resolveUploadPath(relativePath);

  if (!absolutePath) return false;

  try {
    await fs.promises.unlink(absolutePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

module.exports = {
  UPLOAD_ROOT,
  IMAGE_TYPES,
  ensureUploadDirectory,
  detectImageType,
  saveImageBuffer,
  resolveUploadPath,
  deleteUpload,
};
