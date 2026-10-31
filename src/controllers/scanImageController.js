const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { sendSuccess } = require("../utils/apiResponse");
const { Scan } = require("../models");
const { detectImageType, saveImageBuffer, deleteUpload } = require("../utils/fileStorage");
const { prepareImage, analyzeImage } = require("../services/imageDetectionService");
const {
  isCloudStorageEnabled,
  uploadImageBuffer,
  destroyImage,
} = require("../services/cloudStorageService");
const {
  sanitizeOriginalFilename,
  completeScan,
  failScan,
} = require("../services/scanService");
const { serializeScan, serializeResult } = require("../utils/serializers");

const scanImage = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer?.length) {
    throw new AppError(
      'No image was uploaded. Send one JPG or PNG file in the "image" field.',
      422,
      { code: "IMAGE_REQUIRED" }
    );
  }

  // The extension and browser-provided MIME type are not trusted. The magic
  // bytes decide what this file really is.
  const detected = detectImageType(req.file.buffer);

  if (!detected) {
    throw new AppError("The uploaded file is not a valid JPG or PNG image.", 422, {
      code: "INVALID_IMAGE_CONTENT",
    });
  }

  if (req.file.mimetype !== detected.mime) {
    throw new AppError(
      "The file content does not match its declared image type. Please upload the original image.",
      422,
      { code: "IMAGE_TYPE_MISMATCH" }
    );
  }

  const originalName =
    sanitizeOriginalFilename(req.file.originalname) || `image.${detected.extension}`;

  const scan = await Scan.create({
    userId: req.userId,
    scanType: "image",
    inputValue: originalName,
    status: "pending",
  });

  let storedImage = null;

  try {
    // Decode once: this rejects decompression bombs, strips EXIF/GPS metadata
    // and produces the single clean JPEG that is both stored and analysed.
    const prepared = await prepareImage(req.file.buffer);

    if (isCloudStorageEnabled()) {
      const uploaded = await uploadImageBuffer(prepared.buffer, {
        kind: "scans",
        format: "jpg",
      });

      storedImage = {
        fileUrl: uploaded.url,
        filePublicId: uploaded.publicId,
      };
    } else {
      // Local development and the test suite run offline.
      const saved = await saveImageBuffer(prepared.buffer, "jpg");

      storedImage = { fileUrl: saved.relativePath, filePublicId: null };
    }

    await scan.update(storedImage);

    const analysis = await analyzeImage({ prepared });
    const result = await completeScan(scan, analysis);

    return sendSuccess(res, 201, "Image scan completed successfully.", {
      scan: serializeScan(scan),
      result: serializeResult(result),
    });
  } catch (error) {
    await failScan(scan);

    if (storedImage?.filePublicId) {
      await destroyImage(storedImage.filePublicId).catch(() => {});
    } else if (storedImage?.fileUrl) {
      try {
        await deleteUpload(storedImage.fileUrl);
      } catch {
        // A leftover file is logged by the storage layer; never mask the real
        // analysis error because cleanup failed.
      }
    }

    throw error;
  }
});

module.exports = { scanImage };
