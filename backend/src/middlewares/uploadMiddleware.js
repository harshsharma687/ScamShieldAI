/**
 * Multer stores the upload in memory only long enough to check its magic bytes
 * and re-encode it. Memory storage also means a rejected upload never creates a
 * partial file on disk.
 */
const multer = require("multer");
const env = require("../config/env");
const AppError = require("../utils/AppError");

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.uploads.maxImageBytes,
    files: 1,
    fields: 5,
    parts: 10,
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(
        new AppError("Only JPG and PNG images are supported.", 422, {
          code: "INVALID_IMAGE_TYPE",
        })
      );
    }

    return callback(null, true);
  },
});

const uploadImage = upload.single("image");

module.exports = { uploadImage, upload };
