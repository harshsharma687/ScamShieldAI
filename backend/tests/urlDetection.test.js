const test = require("node:test");
const assert = require("node:assert/strict");
const AppError = require("../src/utils/AppError");
const {
  normalizeUrl,
  getUrlIndicators,
  isPrivateOrLocalHost,
} = require("../src/services/urlDetectionService");

function rejects(input, code) {
  assert.throws(
    () => normalizeUrl(input),
    (error) => error instanceof AppError && (!code || error.code === code)
  );
}

test("normalizeUrl accepts public HTTP(S) URLs and adds a missing scheme", () => {
  assert.equal(normalizeUrl("https://example.com/a#frag").href, "https://example.com/a");
  assert.equal(normalizeUrl("example.com").href, "https://example.com/");
  assert.equal(normalizeUrl("  http://example.com  ").protocol, "http:");
});

test("normalizeUrl blocks localhost, private and numeric-loopback hosts", () => {
  for (const value of [
    "http://localhost:5000",
    "http://127.0.0.1",
    "http://10.1.2.3",
    "http://172.16.0.1",
    "http://192.168.1.10",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://printer.local",
  ]) {
    rejects(value, "BLOCKED_DESTINATION");
  }

  assert.equal(isPrivateOrLocalHost("example.com"), false);
  assert.equal(isPrivateOrLocalHost("8.8.8.8"), false);
});

test("normalizeUrl rejects bad schemes and embedded credentials", () => {
  rejects("ftp://example.com", "INVALID_URL_SCHEME");
  rejects("https://user:pass@example.com", "URL_CREDENTIALS_BLOCKED");
  rejects("https://example.com/" + "a".repeat(2050), "VALIDATION_ERROR");
  rejects("https://exa\u0000mple.com", "VALIDATION_ERROR");
});

test("getUrlIndicators flags a brand-impersonating phishing URL", () => {
  const url = new URL("https://secure-login-paypal.example.tk/verify-account");
  const indicators = getUrlIndicators(url);
  const codes = indicators.map((item) => item.code);

  assert.ok(codes.includes("brand-impersonation"));
  assert.ok(codes.includes("suspicious-tld"));
  assert.ok(codes.includes("scam-keywords"));
  assert.ok(indicators.reduce((total, item) => total + item.weight, 0) >= 60);
});

test("getUrlIndicators flags shorteners, HTTP and raw public IPs", () => {
  assert.ok(
    getUrlIndicators(new URL("https://bit.ly/abc")).some(
      (item) => item.code === "shortener"
    )
  );
  assert.ok(
    getUrlIndicators(new URL("http://example.com")).some(
      (item) => item.code === "http"
    )
  );
  assert.ok(
    getUrlIndicators(new URL("https://8.8.8.8/login")).some(
      (item) => item.code === "ip-host"
    )
  );
});

test("a clean URL produces no high-weight indicator", () => {
  const indicators = getUrlIndicators(new URL("https://example.com/about"));
  const score = indicators.reduce((total, item) => total + item.weight, 0);

  assert.ok(score < 30, `unexpected score ${score}`);
});
