const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clampScore,
  classifyRisk,
  combineScores,
  isScamScore,
  buildRecommendation,
} = require("../src/utils/risk");

test("classifyRisk uses the documented boundaries", () => {
  assert.equal(classifyRisk(0), "Low");
  assert.equal(classifyRisk(29), "Low");
  assert.equal(classifyRisk(30), "Medium");
  assert.equal(classifyRisk(59), "Medium");
  assert.equal(classifyRisk(60), "High");
  assert.equal(classifyRisk(79), "High");
  assert.equal(classifyRisk(80), "Critical");
  assert.equal(classifyRisk(100), "Critical");
});

test("scores are clamped to 0-100 and rounded", () => {
  assert.equal(clampScore(-20), 0);
  assert.equal(clampScore(140), 100);
  assert.equal(clampScore(72.6), 73);
  assert.equal(clampScore("not a number"), 0);
});

test("only High and Critical are reported as scams", () => {
  assert.equal(isScamScore(59), false);
  assert.equal(isScamScore(60), true);
  assert.equal(isScamScore(99), true);
});

test("AI score is blended with heuristics and neither can erase a risk band", () => {
  assert.equal(combineScores(0, 100), 80);
  assert.equal(combineScores(0, 85), 80);
  assert.equal(combineScores(0, 65), 60);
  assert.equal(combineScores(0, 40), 30);
  assert.equal(combineScores(69, 0), 60);
  assert.equal(combineScores(40, 0), 30);
  assert.equal(combineScores(0, 0), 0);
});

test("recommendations exist for every risk level", () => {
  for (const level of ["Low", "Medium", "High", "Critical"]) {
    assert.match(buildRecommendation(level), /do not|avoid|verify|stay/i);
  }
});
