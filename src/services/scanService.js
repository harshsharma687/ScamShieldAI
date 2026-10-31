/**
 * Shared persistence for all three scan types.
 */
const { Scan, DetectionResult, sequelize } = require("../models");
const { clampScore, classifyRisk, isScamScore } = require("../utils/risk");

function sanitizeOriginalFilename(filename) {
  if (typeof filename !== "string") return "";

  return filename
    .replace(/[\\/]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

async function completeScan(scan, analysis) {
  const riskScore = clampScore(analysis.riskScore);
  const riskLevel = classifyRisk(riskScore);
  // Derive this from the score so the database can never store an inconsistent
  // combination such as riskScore 85 / isScam false.
  const isScam = isScamScore(riskScore);

  const result = await sequelize.transaction(async (transaction) => {
    const created = await DetectionResult.create(
      {
        scanId: scan.id,
        riskScore,
        riskLevel,
        isScam,
        explanation: analysis.explanation,
        recommendation: analysis.recommendation,
        detectionSource: analysis.detectionSource,
      },
      { transaction }
    );

    await scan.update({ status: "completed" }, { transaction });

    return created;
  });

  // Keep the in-memory model consistent for the response serialiser.
  scan.detectionResults = [result];

  return result;
}

async function failScan(scan) {
  try {
    await scan.update({ status: "failed", fileUrl: null });
  } catch (error) {
    console.error(`[scan] could not mark scan ${scan.id} as failed`);
  }
}

async function getOwnedScan(userId, scanId) {
  return Scan.findOne({
    where: { id: scanId, userId },
    include: [
      {
        model: DetectionResult,
        as: "detectionResults",
        required: false,
      },
    ],
  });
}

function requireScanType(expected) {
  return function scanTypeGuard(req, res, next) {
    req.expectedScanType = expected;
    next();
  };
}

module.exports = {
  sanitizeOriginalFilename,
  completeScan,
  failScan,
  getOwnedScan,
  requireScanType,
};
