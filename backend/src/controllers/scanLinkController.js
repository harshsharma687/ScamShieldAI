const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { Scan } = require("../models");
const { normalizeUrl, analyzeUrl } = require("../services/urlDetectionService");
const { completeScan, failScan } = require("../services/scanService");
const { serializeScan, serializeResult } = require("../utils/serializers");

const scanLink = asyncHandler(async (req, res) => {
  // Validate and normalise before creating a row: malformed URLs or private
  // destinations are rejected outright instead of becoming failed history.
  const normalized = normalizeUrl(req.body.url);

  const scan = await Scan.create({
    userId: req.userId,
    scanType: "link",
    inputValue: normalized.href,
    status: "pending",
  });

  try {
    const analysis = await analyzeUrl(normalized.href);
    const result = await completeScan(scan, analysis);

    return sendSuccess(res, 201, "Link scan completed successfully.", {
      scan: serializeScan(scan),
      result: serializeResult(result),
    });
  } catch (error) {
    await failScan(scan);
    throw error;
  }
});

module.exports = { scanLink };
