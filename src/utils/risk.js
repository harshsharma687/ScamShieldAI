/**
 * Risk scoring rules shared by every scan type.
 *
 *   0-29   Low
 *   30-59  Medium
 *   60-79  High
 *   80-100 Critical
 *
 * Only High/Critical (>= 60) is reported as a scam. Medium means "suspicious
 * indicators need review", not a fraud accusation.
 */
const RISK_LEVELS = ["Low", "Medium", "High", "Critical"];

function clampScore(score) {
  const number = Number(score);

  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function classifyRisk(score) {
  const value = clampScore(score);

  if (value >= 80) return "Critical";
  if (value >= 60) return "High";
  if (value >= 30) return "Medium";
  return "Low";
}

function isScamScore(score) {
  return clampScore(score) >= 60;
}

/**
 * Combines deterministic evidence with the AI score.
 *
 * The AI can lower a heuristic score, but concrete evidence sets a floor so a
 * model cannot dismiss, for example, an explicit "send me your OTP" request.
 * That keeps the final number explainable and conservative.
 */
function combineScores(heuristicScore, aiScore) {
  const heuristic = clampScore(heuristicScore);

  if (!Number.isFinite(Number(aiScore))) return heuristic;

  const ai = clampScore(aiScore);
  let combined = Math.round(heuristic * 0.35 + ai * 0.65);

  // Neither source may erase the other's risk band. Without this, a clear
  // AI-detected 85/100 scam with no URL keywords would blend down to Medium
  // and stop being reported as a scam.
  if (heuristic >= 80) combined = Math.max(combined, 80);
  else if (heuristic >= 60) combined = Math.max(combined, 60);
  else if (heuristic >= 30) combined = Math.max(combined, 30);

  if (ai >= 80) combined = Math.max(combined, 80);
  else if (ai >= 60) combined = Math.max(combined, 60);
  else if (ai >= 30) combined = Math.max(combined, 30);

  return clampScore(combined);
}

function riskSummary(score) {
  const level = classifyRisk(score);
  const summaries = {
    Low: "No strong scam indicators were found.",
    Medium: "Some suspicious indicators were found and should be reviewed.",
    High: "Multiple strong scam indicators were found.",
    Critical: "Critical scam indicators were found. Do not interact.",
  };

  return summaries[level];
}

function buildRecommendation(level) {
  const recommendations = {
    Low: "Stay cautious. Verify the sender or website through an official channel before sharing information.",
    Medium:
      "Do not click links or share personal information. Verify the sender through an official channel before taking any action.",
    High:
      "Avoid interacting with this content. Do not click links, send money, or share OTPs, passwords or card details. Report and delete it.",
    Critical:
      "Stop interacting immediately. Do not click links, send money, or share OTPs, passwords or card details. Report the content and contact your bank through its official number if you already responded.",
  };

  return recommendations[level];
}

module.exports = {
  RISK_LEVELS,
  clampScore,
  classifyRisk,
  isScamScore,
  combineScores,
  riskSummary,
  buildRecommendation,
};
