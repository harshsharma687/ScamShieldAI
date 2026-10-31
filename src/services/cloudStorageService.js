/**
 * Image storage on Cloudinary.
 *
 * Uploaded scan images and profile photos are never written to the server's
 * disk when Cloudinary is configured: a hosted disk fills up (and is wiped on
 * redeploy), while Cloudinary keeps the files and serves them over HTTPS.
 *
 * Only two things are stored in MySQL: the secure URL and the public id. The
 * public id is what allows a real delete when a scan or account is removed.
 *
 * The test environment deliberately uses local disk instead, so the automated
 * suite stays offline and deterministic.
 */
const cloudinary = require("cloudinary").v2;
const crypto = require("crypto");
const env = require("../config/env");
const AppError = require("../utils/AppError");

let configured = false;

function ensureConfigured() {
  if (configured) return;

  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });

  configured = true;
}

/** True when uploads should go to Cloudinary rather than the local disk. */
function isCloudStorageEnabled() {
  return Boolean(env.cloudinary.isConfigured && !env.isTest);
}

function folderFor(kind) {
  const root = env.cloudinary.folder.replace(/^\/+|\/+$/g, "") || "scamshield";

  return `${root}/${kind}`;
}

function randomPublicId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * Uploads a buffer (already re-encoded by sharp, so no EXIF/GPS metadata is
 * sent) and resolves with { url, publicId }.
 */
function uploadImageBuffer(buffer, { kind = "scans", format = "jpg" } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError("There was no image data to store.", 422, {
      code: "IMAGE_REQUIRED",
    });
  }

  ensureConfigured();

  const folder = folderFor(kind);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: randomPublicId(kind === "avatars" ? "avatar" : "scan"),
        resource_type: "image",
        format,
        timeout: 45000,
        // Overwriting is impossible because the public id is random.
        overwrite: false,
        // Keeps the CDN response small; the original is kept for re-analysis.
        transformation: [{ quality: "auto:good" }],
      },
      (error, result) => {
        if (error) {
          // Never log the key, the secret or the image contents.
          console.warn(
            `[cloudinary] upload failed (${error.http_code || "no status"})`
          );

          return reject(
            new AppError(
              "Image storage is temporarily unavailable. Your image was not saved, so the scan was cancelled. Please try again.",
              503,
              { code: "IMAGE_STORAGE_UNAVAILABLE" }
            )
          );
        }

        if (!result?.secure_url || !result?.public_id) {
          return reject(
            new AppError(
              "Image storage returned an unexpected response. The scan was cancelled.",
              503,
              { code: "IMAGE_STORAGE_UNAVAILABLE" }
            )
          );
        }

        return resolve({
          url: result.secure_url,
          publicId: result.public_id,
          provider: "cloudinary",
        });
      }
    );

    stream.end(buffer);
  });
}

/** Deletes an uploaded image. Missing images are treated as already deleted. */
async function destroyImage(publicId) {
  if (!publicId) return false;

  ensureConfigured();

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });

    return result?.result === "ok";
  } catch (error) {
    console.warn(
      `[cloudinary] delete failed (${error.http_code || "no status"})`
    );
    return false;
  }
}

module.exports = {
  isCloudStorageEnabled,
  uploadImageBuffer,
  destroyImage,
};
