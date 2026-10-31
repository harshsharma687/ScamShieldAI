const { Op } = require("sequelize");
const { Scan, DetectionResult } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { serializeRecentScan } = require("../utils/serializers");

/**
 * All numbers come from the authenticated user's own rows.
 * "Safe" only counts verdicts produced by a real check (AI or threat intel).
 * A low-scoring heuristic fallback is reported separately as "unverified".
 */
const getStats = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const [
    totalScans,
    imageScans,
    linkScans,
    messageScans,
    filesUploaded,
    pendingScans,
    failedScans,
    completedResults,
  ] = await Promise.all([
    Scan.count({ where: { userId } }),
    Scan.count({ where: { userId, scanType: "image" } }),
    Scan.count({ where: { userId, scanType: "link" } }),
    Scan.count({ where: { userId, scanType: "message" } }),
    Scan.count({
      where: {
        userId,
        scanType: "image",
        status: "completed",
        fileUrl: { [Op.ne]: null },
      },
    }),
    Scan.count({ where: { userId, status: "pending" } }),
    Scan.count({ where: { userId, status: "failed" } }),
    DetectionResult.findAll({
      attributes: ["riskScore", "riskLevel", "isScam", "detectionSource"],
      include: [
        {
          model: Scan,
          as: "scan",
          attributes: [],
          where: { userId, status: "completed" },
          required: true,
        },
      ],
      raw: true,
    }),
  ]);

  const riskBreakdown = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  let safeItems = 0;
  let suspiciousItems = 0;
  let needsReviewItems = 0;
  let unverifiedItems = 0;

  for (const result of completedResults) {
    if (riskBreakdown[result.riskLevel] !== undefined) {
      riskBreakdown[result.riskLevel] += 1;
    }

    if (result.isScam) {
      suspiciousItems += 1;
    } else if (result.riskScore >= 30) {
      needsReviewItems += 1;
    } else if (result.detectionSource === "heuristic-fallback") {
      unverifiedItems += 1;
    } else {
      safeItems += 1;
    }
  }

  const latestScan = await Scan.findOne({
    where: { userId },
    attributes: ["createdAt"],
    order: [["createdAt", "DESC"]],
  });

  return sendSuccess(res, 200, "Dashboard statistics loaded.", {
    totalScans,
    safeItems,
    suspiciousItems,
    needsReviewItems,
    unverifiedItems,
    filesUploaded,
    pendingScans,
    failedScans,
    completedScans: completedResults.length,
    typeStatistics: {
      image: imageScans,
      link: linkScans,
      message: messageScans,
    },
    riskBreakdown,
    lastScanAt: latestScan ? latestScan.createdAt : null,
  });
});

const getRecentScans = asyncHandler(async (req, res) => {
  const requested = Number(req.query.limit);
  const limit = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 1), 10)
    : 5;

  const scans = await Scan.findAll({
    where: { userId: req.userId },
    include: [
      {
        model: DetectionResult,
        as: "detectionResults",
        required: false,
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
  });

  return sendSuccess(res, 200, "Recent scans loaded.", {
    scans: scans.map(serializeRecentScan),
  });
});

module.exports = { getStats, getRecentScans };
