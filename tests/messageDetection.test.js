const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getMessageIndicators,
  extractUrls,
} = require("../src/services/messageDetectionService");

function codesFor(text) {
  return getMessageIndicators(text).map((item) => item.code);
}

test("an OTP request combined with a phishing link scores as a scam", () => {
  const text =
    "URGENT: Your bank account is blocked. Click here to verify your account: https://secure-login-paypal.example.tk/verify-account and send your OTP immediately.";
  const indicators = getMessageIndicators(text);
  const score = indicators.reduce((total, item) => total + item.weight, 0);

  assert.ok(indicators.some((item) => item.code.startsWith("otp-request")));
  assert.ok(indicators.some((item) => item.code === "credential-plus-link"));
  assert.ok(score >= 60, `expected >= 60, got ${score}`);
});

test("negated security advice is not treated as a request", () => {
  const codes = codesFor(
    "Never share your OTP or password with anyone. We will never ask for it."
  );

  assert.ok(!codes.some((code) => code.includes("otp")));
  assert.ok(!codes.includes("password-request"));
});

test("a normal personal message has no indicators", () => {
  assert.deepEqual(codesFor("Hi, are we still meeting for lunch at 1pm?"), []);
});

test("money and legal pressure are detected", () => {
  const codes = codesFor(
    "This is the tax department. Pay the fine immediately or face legal action. Send money today."
  );

  assert.ok(codes.includes("legal-threat"));
  assert.ok(codes.includes("urgency"));
  assert.ok(codes.includes("money-request"));
});

test("links are extracted without trailing punctuation and de-duplicated", () => {
  assert.deepEqual(
    extractUrls("See https://a.example.com/x, and https://a.example.com/x."),
    ["https://a.example.com/x"]
  );
  assert.deepEqual(extractUrls("No links here"), []);
});
