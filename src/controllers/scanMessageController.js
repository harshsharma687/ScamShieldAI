const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { sendSuccess } = require("../utils/apiResponse");
const { Scan } = require("../models");
const { analyzeMessage } = require("../services/messageDetectionService");
const { completeScan, failScan } = require("../services/scanService");
const { serializeScan, serializeResult } = require("../utils/serializers");

const scanMessage = asyncHandler(async (req, res) => {
  const message = req.body.message.trim();

  if (!message) {
    throw new AppError("A message is required.", 422, {
      code: "VALIDATION_ERROR",
    });
  }

  const scan = await Scan.create({
    userId: req.userId,
    scanType: "message",
    inputValue: message,
    status: "pending",
  });

  try {
    const analysis = await analyzeMessage(message);
    const result = await completeScan(scan, analysis);

    return sendSuccess(res, 201, "Message scan completed successfully.", {
      scan: serializeScan(scan),
      result: serializeResult(result),
    });
  } catch (error) {
    await failScan(scan);
    throw error;
  }
});

module.exports = { scanMessage };
