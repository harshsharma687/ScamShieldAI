const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { sendSuccess } = require("../utils/apiResponse");
const { Scan } = require("../models");
const { detectImageType, saveImageBuffer, deleteUpload } = require("../utils/fileStorage");
const { analyzeImage } = require("../services/imageDetectionService");
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

  let savedFile = null;

  try {
    savedFile = await saveImageBuffer(req.file.buffer, detected.extension);
    await scan.update({ fileUrl: savedFile.relativePath });

    const analysis = await analyzeImage({ buffer: req.file.buffer });
    const result = await completeScan(scan, analysis);

    return sendSuccess(res, 201, "Image scan completed successfully.", {
      scan: serializeScan(scan),
      result: serializeResult(result),
    });
  } catch (error) {
    await failScan(scan);

    if (savedFile) {
      try {
        await deleteUpload(savedFile.relativePath);
      } catch {
        // A leftover file is logged by the storage layer; never mask the real
        // analysis error because cleanup failed.
      }
    }

    throw error;
  }
});

module.exports = { scanImage };
