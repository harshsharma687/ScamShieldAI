/**
 * One-off maintenance script: fills the easy Hindi + English answer columns for
 * results created before that feature existed.
 *
 * It only restates the stored risk level in both languages, so it never invents
 * evidence. New scans are written by the normal scan flow and do not need this.
 *
 *   node scripts/backfillBilingualAnswers.js
 */
require("dotenv").config();

const { sequelize, DetectionResult } = require("../src/models");
const { buildEasyAnswer } = require("../src/utils/bilingual");

async function main() {
  const rows = await DetectionResult.findAll({
    where: { explanationHi: null },
    attributes: ["id", "riskLevel", "riskScore", "explanation", "recommendation"],
  });

  if (!rows.length) {
    console.log("Nothing to backfill: every result already has a Hindi answer.");
    return;
  }

  let updated = 0;

  for (const row of rows) {
    const easy = buildEasyAnswer({
      riskLevel: row.riskLevel,
      riskScore: row.riskScore,
      indicators: [],
    });

    await row.update({
      explanationHi: easy.hi.explanation,
      recommendationHi: easy.hi.recommendation,
      explanationEn: row.explanationEn || row.explanation,
      recommendationEn: row.recommendationEn || row.recommendation,
    });

    updated += 1;
  }

  console.log(`Backfilled ${updated} result(s) with Hindi + English answers.`);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
