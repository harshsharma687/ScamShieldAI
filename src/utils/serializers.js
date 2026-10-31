/**
 * Converts Sequelize instances into the exact JSON shapes the frontend expects.
 * Keeping this in one place prevents accidentally returning hashes, internal
 * file paths or other users' data.
 */
const { RISK_HINDI } = require("./bilingual");

const TYPE_LABELS = {
  image: "Image",
  link: "Link",
  message: "Message",
};

function serializeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profileImage: user.profileImage || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Only an actual AI analysis is "verified". Deterministic rules and local OCR
// are useful evidence, but they must never make a result look AI-checked.
const VERIFIED_SOURCES = new Set(["ai-vision", "ai+heuristics"]);

function isVerified(result) {
  return Boolean(result && VERIFIED_SOURCES.has(result.detectionSource));
}

function serializeResult(result) {
  if (!result) return null;

  return {
    id: result.id,
    riskScore: result.riskScore,
    riskLevel: result.riskLevel,
    isScam: Boolean(result.isScam),
    explanation: result.explanation,
    recommendation: result.recommendation,
    // Two easy-language answers, shown one above the other in the UI. Rows
    // created before this feature only have the English half.
    answers: {
      hi: result.explanationHi
        ? {
            explanation: result.explanationHi,
            recommendation: result.recommendationHi || "",
          }
        : null,
      en: {
        explanation: result.explanationEn || result.explanation,
        recommendation: result.recommendationEn || result.recommendation,
      },
    },
    riskLevelHi: RISK_HINDI[result.riskLevel] || result.riskLevel,
    detectionSource: result.detectionSource,
    verified: isVerified(result),
    createdAt: result.createdAt,
  };
}

function latestResult(scan) {
  const results = scan.detectionResults || scan.DetectionResults || [];

  if (!results.length) return null;

  return [...results].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
}

function scanDisplayName(scan) {
  const value = (scan.inputValue || "").trim();

  if (!value) {
    return scan.scanType === "image" ? "Image upload" : "Untitled scan";
  }

  const singleLine = value.replace(/\s+/g, " ");

  if (scan.scanType === "image") return singleLine.slice(0, 80);

  return singleLine.length > 90 ? `${singleLine.slice(0, 87)}...` : singleLine;
}

function statusLabel(scan, result) {
  if (scan.status === "failed") return "Failed";
  if (scan.status === "pending" || !result) return "Pending Analysis";

  if (result.isScam) return "Suspicious";
  if (result.riskScore >= 30) return "Needs Review";
  if (!isVerified(result)) return "Unverified";

  return "Safe";
}

function serializeScan(scan) {
  const result = latestResult(scan);

  return {
    id: scan.id,
    scanType: scan.scanType,
    typeLabel: TYPE_LABELS[scan.scanType] || scan.scanType,
    inputValue: scan.inputValue,
    displayName: scanDisplayName(scan),
    // Owners fetch the file through an authenticated route; the stored path
    // stays hidden.
    fileUrl: scan.fileUrl ? `/api/scans/${scan.id}/file` : null,
    status: scan.status,
    statusLabel: statusLabel(scan, result),
    result: serializeResult(result),
    createdAt: scan.createdAt,
    updatedAt: scan.updatedAt,
  };
}

function serializeRecentScan(scan) {
  const serialized = serializeScan(scan);

  return {
    id: serialized.id,
    name: serialized.displayName,
    type: serialized.typeLabel,
    scanType: serialized.scanType,
    date: serialized.createdAt,
    status: serialized.statusLabel,
    riskLevel: serialized.result ? serialized.result.riskLevel : null,
    canOpenFile: Boolean(serialized.fileUrl),
  };
}

module.exports = {
  TYPE_LABELS,
  serializeUser,
  serializeResult,
  serializeScan,
  serializeRecentScan,
  latestResult,
  isVerified,
  statusLabel,
};
