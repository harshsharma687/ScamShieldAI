/**
 * End-to-end API tests against a real ephemeral MySQL instance.
 *
 * mysql-memory-server downloads/starts MySQL 8.4 only for this test process,
 * runs the real migrations, and stops afterwards. No system MySQL is required.
 */
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("node:http");
const path = require("path");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const sharp = require("sharp");
const { createDB } = require("mysql-memory-server");

let db;
let app;
let agent;
let agent2;
let token1;
let token2;
let user1Id;
let messageScanId;
let linkScanId;
let messageRiskLevel;
let benignScanId;
let refreshCookie2;

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

describe("ScamShield AI API", () => {
  before(async () => {
    db = await createDB({ version: "8.4.x", dbName: "scamshield_test" });

    process.env.NODE_ENV = "test";
    process.env.DB_HOST = "127.0.0.1";
    process.env.DB_PORT = String(db.port);
    process.env.DB_NAME = db.dbName;
    process.env.DB_USER = db.username;
    process.env.DB_PASSWORD = "";
    process.env.DB_LOGGING = "false";
    process.env.BCRYPT_SALT_ROUNDS = "10";
    process.env.AI_API_URL = "";
    process.env.AI_API_KEY = "";
    process.env.AI_MODEL = "glm-4v-plus";
    process.env.SAFE_BROWSING_API_KEY = "";
    process.env.SMTP_HOST = "";
    process.env.FRONTEND_URL = "http://localhost:5173";

    // Load config only after the test environment variables are in place.
    const { sequelize } = require("../../src/config/database");
    const Sequelize = require("sequelize");
    const migrationsDir = path.join(__dirname, "..", "..", "src", "migrations");
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".js"))
      .sort();

    for (const file of migrationFiles) {
      const migration = require(path.join(migrationsDir, file));
      await migration.up(sequelize.getQueryInterface(), Sequelize);
    }

    app = require("../../src/app");
    agent = request.agent(app);
    agent2 = request.agent(app);
  }, { timeout: 300000 });

  after(async () => {
    const { closeOcrWorker } = require("../../src/services/ocrService");
    await closeOcrWorker().catch(() => {});

    if (app) {
      const { sequelize } = require("../../src/config/database");
      await sequelize.close();
    }
    if (db) await db.stop();
  }, { timeout: 60000 });

  test("health endpoint and CORS rules", async () => {
    const health = await request(app).get("/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.success, true);
    assert.equal(health.body.data.database, "connected");

    const allowed = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:5173");
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:5173");

    const blocked = await request(app)
      .get("/api/health")
      .set("Origin", "https://evil.example");
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, "CORS_BLOCKED");
  });

  test("unknown routes return the standard 404 shape", async () => {
    const res = await request(app).get("/api/does-not-exist");
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, "ROUTE_NOT_FOUND");
  });

  test("malformed JSON is rejected safely", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, "INVALID_JSON");
  });

  test("registration creates an account, sets an HTTP-only cookie, and hides secrets", async () => {
    const res = await agent.post("/api/auth/register").send({
      name: "Test User",
      email: "user1@example.com",
      password: "Password123",
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.accessToken);
    assert.equal(res.body.data.user.email, "user1@example.com");
    assert.equal(res.body.data.user.password, undefined);
    assert.equal(res.body.data.user.passwordHash, undefined);

    const cookie = res.headers["set-cookie"]?.[0] || "";
    assert.match(cookie, /scamshield_refresh=/);
    assert.match(cookie, /HttpOnly/i);

    token1 = res.body.data.accessToken;
    user1Id = res.body.data.user.id;
  });

  test("registration rejects duplicates and invalid input", async () => {
    const duplicate = await request(app).post("/api/auth/register").send({
      name: "Test User",
      email: "user1@example.com",
      password: "Password123",
    });

    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.code, "EMAIL_IN_USE");

    const invalid = await request(app).post("/api/auth/register").send({
      name: "X",
      email: "not-an-email",
      password: "short",
    });

    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.success, false);
    assert.ok(Array.isArray(invalid.body.errors));
    assert.ok(invalid.body.errors.length >= 3);
  });

  test("login, me, and unauthenticated access", async () => {
    const wrong = await request(app).post("/api/auth/login").send({
      email: "user1@example.com",
      password: "WrongPassword123",
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.code, "INVALID_CREDENTIALS");

    const login = await agent.post("/api/auth/login").send({
      email: "user1@example.com",
      password: "Password123",
    });
    assert.equal(login.status, 200);
    token1 = login.body.data.accessToken;

    const me = await request(app).get("/api/auth/me").set(bearer(token1));
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email, "user1@example.com");
    assert.equal(me.body.data.user.password, undefined);

    const anonymous = await request(app).get("/api/auth/me");
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, "AUTH_REQUIRED");

    const noDashboard = await request(app).get("/api/dashboard/stats");
    assert.equal(noDashboard.status, 401);
  });

  test("password reset reports unconfigured email delivery honestly", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({
      email: "user1@example.com",
    });

    assert.equal(res.status, 503);
    assert.equal(res.body.code, "EMAIL_NOT_CONFIGURED");
  });

  test("message scan produces a real evidence-based verdict and saves it", async () => {
    const message =
      "URGENT: Your bank account is blocked. Click here to verify your account: https://secure-login-paypal.example.tk/verify-account and send your OTP immediately.";

    const res = await request(app)
      .post("/api/scans/message")
      .set(bearer(token1))
      .send({ message });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { scan, result } = res.body.data;

    assert.equal(scan.scanType, "message");
    assert.equal(scan.status, "completed");
    assert.equal(scan.statusLabel, "Suspicious");
    assert.ok(result.riskScore >= 60, `riskScore was ${result.riskScore}`);
    assert.equal(result.isScam, true);
    assert.equal(result.verified, false);
    assert.equal(result.detectionSource, "heuristic-fallback");
    assert.match(result.explanation, /AI analysis was unavailable/i);
    assert.ok(result.recommendation.length > 20);

    messageScanId = scan.id;
    messageRiskLevel = result.riskLevel;
  });

  test("link scan detects a brand-impersonating URL", async () => {
    const res = await request(app)
      .post("/api/scans/link")
      .set(bearer(token1))
      .send({ url: "https://secure-login-paypal.example.tk/verify-account" });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { scan, result } = res.body.data;

    assert.equal(scan.scanType, "link");
    assert.equal(scan.status, "completed");
    assert.ok(result.riskScore >= 60);
    assert.equal(result.isScam, true);
    assert.equal(result.verified, false);
    assert.match(result.explanation, /brand|paypal/i);

    linkScanId = scan.id;
  });

  test("link scan blocks SSRF destinations and invalid schemes", async () => {
    for (const url of [
      "http://localhost:5000/admin",
      "http://127.0.0.1",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
    ]) {
      const res = await request(app)
        .post("/api/scans/link")
        .set(bearer(token1))
        .send({ url });

      assert.equal(res.status, 400, url);
      assert.equal(res.body.code, "BLOCKED_DESTINATION");
    }

    const ftp = await request(app)
      .post("/api/scans/link")
      .set(bearer(token1))
      .send({ url: "ftp://example.com/file" });
    assert.equal(ftp.status, 422);
    assert.equal(ftp.body.code, "INVALID_URL_SCHEME");

    const empty = await request(app)
      .post("/api/scans/link")
      .set(bearer(token1))
      .send({ url: "" });
    assert.equal(empty.status, 422);
    assert.equal(empty.body.code, "VALIDATION_ERROR");
  });

  test("message validation rejects empty and oversized input", async () => {
    const empty = await request(app)
      .post("/api/scans/message")
      .set(bearer(token1))
      .send({ message: "   " });
    assert.equal(empty.status, 422);

    const tooLong = await request(app)
      .post("/api/scans/message")
      .set(bearer(token1))
      .send({ message: "a".repeat(5001) });
    assert.equal(tooLong.status, 422);
  });

  test("dashboard statistics are calculated from the user's rows", async () => {
    const res = await request(app)
      .get("/api/dashboard/stats")
      .set(bearer(token1));

    assert.equal(res.status, 200);
    assert.match(res.headers["cache-control"], /no-store/);
    const stats = res.body.data;

    assert.equal(stats.totalScans, 2);
    assert.equal(stats.suspiciousItems, 2);
    assert.equal(stats.safeItems, 0);
    assert.equal(stats.filesUploaded, 0);
    assert.equal(stats.typeStatistics.image, 0);
    assert.equal(stats.typeStatistics.link, 1);
    assert.equal(stats.typeStatistics.message, 1);
    assert.equal(stats.failedScans, 0);
  });

  test("recent scans reflect the database, not demo numbers", async () => {
    const res = await request(app)
      .get("/api/dashboard/recent-scans")
      .set(bearer(token1));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.scans.length, 2);

    for (const scan of res.body.data.scans) {
      assert.equal(scan.status, "Suspicious");
      assert.ok(["Image", "Link", "Message"].includes(scan.type));
      assert.ok(scan.date);
    }
  });

  test("history supports pagination, filtering, search, and sorting", async () => {
    const all = await request(app)
      .get("/api/history?limit=10")
      .set(bearer(token1));
    assert.equal(all.status, 200);
    assert.equal(all.body.meta.pagination.total, 2);
    assert.equal(all.body.data.scans.length, 2);

    const byType = await request(app)
      .get("/api/history?type=link")
      .set(bearer(token1));
    assert.equal(byType.body.data.scans.length, 1);
    assert.equal(byType.body.data.scans[0].scanType, "link");

    const byRisk = await request(app)
      .get(`/api/history?riskLevel=${encodeURIComponent(messageRiskLevel)}`)
      .set(bearer(token1));
    assert.ok(byRisk.body.data.scans.length >= 1);
    for (const scan of byRisk.body.data.scans) {
      assert.equal(scan.result.riskLevel, messageRiskLevel);
    }

    const search = await request(app)
      .get("/api/history?search=bank%20account")
      .set(bearer(token1));
    assert.equal(search.body.data.scans.length, 1);
    assert.equal(search.body.data.scans[0].id, messageScanId);

    const oldest = await request(app)
      .get("/api/history?sort=oldest")
      .set(bearer(token1));
    assert.equal(oldest.body.data.scans[0].id, messageScanId);

    const page = await request(app)
      .get("/api/history?limit=1&page=2")
      .set(bearer(token1));
    assert.equal(page.body.data.scans.length, 1);
    assert.equal(page.body.meta.pagination.page, 2);
    assert.equal(page.body.meta.pagination.totalPages, 2);

    const single = await request(app)
      .get(`/api/history/${messageScanId}`)
      .set(bearer(token1));
    assert.equal(single.status, 200);
    assert.equal(single.body.data.scan.id, messageScanId);

    const typed = await request(app)
      .get(`/api/scans/message/${messageScanId}`)
      .set(bearer(token1));
    assert.equal(typed.status, 200);

    const wrongType = await request(app)
      .get(`/api/scans/link/${messageScanId}`)
      .set(bearer(token1));
    assert.equal(wrongType.status, 404);

    const file = await request(app)
      .get(`/api/scans/${messageScanId}/file`)
      .set(bearer(token1));
    assert.equal(file.status, 404);
  });

  test("image upload validates real content and falls back to local OCR without AI", async () => {
    const missing = await request(app)
      .post("/api/scans/image")
      .set(bearer(token1));
    assert.equal(missing.status, 422);
    assert.equal(missing.body.code, "IMAGE_REQUIRED");

    const wrongDeclared = await request(app)
      .post("/api/scans/image")
      .set(bearer(token1))
      .attach("image", Buffer.from("plain text"), {
        filename: "fake.png",
        contentType: "image/png",
      });
    assert.equal(wrongDeclared.status, 422);
    assert.equal(wrongDeclared.body.code, "INVALID_IMAGE_CONTENT");

    const wrongType = await request(app)
      .post("/api/scans/image")
      .set(bearer(token1))
      .attach("image", Buffer.from("plain text"), {
        filename: "note.txt",
        contentType: "text/plain",
      });
    assert.equal(wrongType.status, 422);
    assert.equal(wrongType.body.code, "INVALID_IMAGE_TYPE");

    const png = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 240, g: 220, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const noAi = await request(app)
      .post("/api/scans/image")
      .set(bearer(token1))
      .attach("image", png, { filename: "sample.png", contentType: "image/png" });

    assert.equal(noAi.status, 201, JSON.stringify(noAi.body));
    const result = noAi.body.data.result;
    assert.equal(result.detectionSource, "ocr-fallback");
    assert.equal(result.verified, false);
    assert.equal(noAi.body.data.scan.statusLabel, "Unverified");
    assert.match(result.explanation, /OCR/i);

    const { Scan } = require("../../src/models");
    const latestImage = await Scan.findOne({
      where: { scanType: "image" },
      order: [["createdAt", "DESC"]],
    });

    assert.equal(latestImage.status, "completed");
    assert.ok(latestImage.fileUrl);

    const stats = await request(app)
      .get("/api/dashboard/stats")
      .set(bearer(token1));
    assert.equal(stats.body.data.totalScans, 3);
    assert.equal(stats.body.data.failedScans, 0);
    assert.equal(stats.body.data.typeStatistics.image, 1);
  }, { timeout: 120000 });

  test("expired access tokens are rejected with TOKEN_EXPIRED", async () => {
    const env = require("../../src/config/env");
    const expired = jwt.sign(
      { sub: String(user1Id), type: "access" },
      env.jwt.accessSecret,
      {
        expiresIn: -10,
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
      }
    );

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${expired}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.code, "TOKEN_EXPIRED");
  });

  test("image scan runs through a configured vision provider and serves the owner-only file", async () => {
    const env = require("../../src/config/env");
    const mockAi = http.createServer((req, res) => {
      req.on("data", () => {});
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    riskScore: 87,
                    explanation:
                      "The screenshot shows a fake payment receipt with a mismatched sender and an urgent request for a transfer.",
                    recommendation:
                      "Do not send money. Verify the payment through your bank's official app.",
                    indicators: ["fake receipt", "urgent transfer request"],
                  }),
                },
              },
            ],
          })
        );
      });
    });

    await new Promise((resolve) => mockAi.listen(0, "127.0.0.1", resolve));
    const port = mockAi.address().port;

    env.ai.apiUrl = `http://127.0.0.1:${port}/v1`;
    env.ai.apiKey = "test-key";
    env.ai.model = "mock-vision";

    try {
      const png = await sharp({
        create: {
          width: 24,
          height: 24,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const scan = await request(app)
        .post("/api/scans/image")
        .set(bearer(token1))
        .attach("image", png, {
          filename: "receipt.png",
          contentType: "image/png",
        });

      assert.equal(scan.status, 201, JSON.stringify(scan.body));
      assert.equal(scan.body.data.result.riskLevel, "Critical");
      assert.equal(scan.body.data.result.verified, true);
      assert.equal(scan.body.data.result.detectionSource, "ai-vision");

      const imageScanId = scan.body.data.scan.id;
      const file = await request(app)
        .get(`/api/scans/${imageScanId}/file`)
        .set(bearer(token1));

      assert.equal(file.status, 200);
      assert.match(file.headers["content-type"], /^image\/(jpeg|png)/);
      assert.ok(file.body.length > 0);

      const removed = await request(app)
        .delete(`/api/history/${imageScanId}`)
        .set(bearer(token1));
      assert.equal(removed.status, 200);
    } finally {
      env.ai.apiUrl = "";
      env.ai.apiKey = "";
      env.ai.model = "glm-4v-plus";
      await new Promise((resolve) => mockAi.close(resolve));
    }
  });

  test("a second user cannot read or delete another user's scans", async () => {
    const registration = await agent2.post("/api/auth/register").send({
      name: "Second User",
      email: "user2@example.com",
      password: "Password123",
    });

    assert.equal(registration.status, 201);
    token2 = registration.body.data.accessToken;
    refreshCookie2 = (registration.headers["set-cookie"]?.[0] || "").split(";")[0];

    const dashboard = await request(app)
      .get("/api/dashboard/stats")
      .set(bearer(token2));
    assert.equal(dashboard.body.data.totalScans, 0);

    const history = await request(app)
      .get("/api/history")
      .set(bearer(token2));
    assert.equal(history.body.data.scans.length, 0);

    const read = await request(app)
      .get(`/api/scans/${messageScanId}`)
      .set(bearer(token2));
    assert.equal(read.status, 404);

    const remove = await request(app)
      .delete(`/api/history/${messageScanId}`)
      .set(bearer(token2));
    assert.equal(remove.status, 404);

    const stillThere = await request(app)
      .get(`/api/history/${messageScanId}`)
      .set(bearer(token1));
    assert.equal(stillThere.status, 200);
  });

  test("refresh tokens rotate and reuse revokes the session", async () => {
    const firstRefresh = await agent2.post("/api/auth/refresh");
    assert.equal(firstRefresh.status, 200, JSON.stringify(firstRefresh.body));
    assert.ok(firstRefresh.body.data.accessToken);

    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie2);

    assert.equal(replay.status, 401);
    assert.equal(replay.body.code, "REFRESH_TOKEN_REUSE");

    const afterReplay = await agent2.post("/api/auth/refresh");
    assert.equal(afterReplay.status, 401);
  });

  test("settings update profile, reject email changes without SMTP, and change password", async () => {
    const profile = await request(app)
      .get("/api/settings/profile")
      .set(bearer(token2));
    assert.equal(profile.status, 200);

    const updated = await request(app)
      .put("/api/settings/profile")
      .set(bearer(token2))
      .send({ name: "Second User Updated" });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.user.name, "Second User Updated");

    const emailChange = await request(app)
      .put("/api/settings/profile")
      .set(bearer(token2))
      .send({
        email: "new2@example.com",
        currentPassword: "Password123",
      });
    assert.equal(emailChange.status, 503);
    assert.equal(emailChange.body.code, "EMAIL_NOT_CONFIGURED");

    const wrongPassword = await request(app)
      .put("/api/settings/change-password")
      .set(bearer(token2))
      .send({
        currentPassword: "WrongPassword123",
        newPassword: "NewPassword123",
      });
    assert.equal(wrongPassword.status, 401);

    const changed = await request(app)
      .put("/api/settings/change-password")
      .set(bearer(token2))
      .send({
        currentPassword: "Password123",
        newPassword: "NewPassword123",
      });
    assert.equal(changed.status, 200);

    const oldLogin = await request(app).post("/api/auth/login").send({
      email: "user2@example.com",
      password: "Password123",
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await request(app).post("/api/auth/login").send({
      email: "user2@example.com",
      password: "NewPassword123",
    });
    assert.equal(newLogin.status, 200);
    token2 = newLogin.body.data.accessToken;
  });

  test("delete account requires the password and cascades", async () => {
    const wrong = await request(app)
      .delete("/api/settings/account")
      .set(bearer(token2))
      .send({ password: "WrongPassword123" });
    assert.equal(wrong.status, 401);

    const removed = await request(app)
      .delete("/api/settings/account")
      .set(bearer(token2))
      .send({ password: "NewPassword123" });
    assert.equal(removed.status, 200);

    const me = await request(app).get("/api/auth/me").set(bearer(token2));
    assert.equal(me.status, 401);
  });

  test("individual and bulk history deletion work for the owner", async () => {
    const benign = await request(app)
      .post("/api/scans/message")
      .set(bearer(token1))
      .send({ message: "Hi, are we still meeting for lunch at 1pm?" });

    assert.equal(benign.status, 201);
    assert.equal(benign.body.data.result.isScam, false);
    assert.equal(benign.body.data.result.detectionSource, "heuristic-fallback");
    assert.equal(benign.body.data.scan.statusLabel, "Unverified");
    benignScanId = benign.body.data.scan.id;

    const deleted = await request(app)
      .delete(`/api/history/${benignScanId}`)
      .set(bearer(token1));
    assert.equal(deleted.status, 200);

    const gone = await request(app)
      .get(`/api/history/${benignScanId}`)
      .set(bearer(token1));
    assert.equal(gone.status, 404);

    const deleteAll = await request(app)
      .delete("/api/history")
      .set(bearer(token1));
    assert.equal(deleteAll.status, 200);
    assert.ok(deleteAll.body.data.deletedCount >= 2);

    const empty = await request(app)
      .get("/api/history")
      .set(bearer(token1));
    assert.equal(empty.body.meta.pagination.total, 0);

    const stats = await request(app)
      .get("/api/dashboard/stats")
      .set(bearer(token1));
    assert.equal(stats.body.data.totalScans, 0);
  });

  test("account deletion removes the user and blocks the access token", async () => {
    const removed = await request(app)
      .delete("/api/settings/account")
      .set(bearer(token1))
      .send({ password: "Password123" });

    assert.equal(removed.status, 200);

    const me = await request(app).get("/api/auth/me").set(bearer(token1));
    assert.equal(me.status, 401);

    const login = await request(app).post("/api/auth/login").send({
      email: "user1@example.com",
      password: "Password123",
    });
    assert.equal(login.status, 401);
  });
});
