/**
 * One-command demo backend.
 *
 *   npm run dev:demo
 *
 * Starts a temporary, real MySQL 8.4 server (via mysql-memory-server), runs the
 * real migrations against it, then starts the normal API. This is for local
 * demos when the system MySQL password is unknown or MySQL is not installed.
 *
 * The database is intentionally ephemeral: every restart starts with empty
 * tables. Use `npm run dev` with your own MySQL for persistent data.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Load .env so real AI/email settings are still used. Environment variables set
// below take precedence because dotenv does not overwrite existing values.
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});

function isUsableSecret(value) {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    !/replace_with|change_me|changeme|your[-_]?secret/i.test(value)
  );
}

// A demo must start even when .env has no JWT secrets. These are random for
// this process only, so demo sessions do not survive a restart.
if (!isUsableSecret(process.env.JWT_ACCESS_SECRET)) {
  process.env.JWT_ACCESS_SECRET = crypto.randomBytes(64).toString("hex");
}
if (!isUsableSecret(process.env.JWT_REFRESH_SECRET)) {
  process.env.JWT_REFRESH_SECRET = crypto.randomBytes(64).toString("hex");
}
if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = crypto.randomBytes(64).toString("hex");
}

process.env.NODE_ENV = "development";
process.env.TRUST_PROXY = "false";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const { createDB } = require("mysql-memory-server");
const Sequelize = require("sequelize");

let db = null;
let server = null;
let shuttingDown = false;

async function runMigrations(sequelize) {
  const migrationsDirectory = path.join(__dirname, "..", "src", "migrations");
  const files = fs
    .readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".js"))
    .sort();

  for (const file of files) {
    const migration = require(path.join(migrationsDirectory, file));
    await migration.up(sequelize.getQueryInterface(), Sequelize);
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${signal} received. Stopping demo server and temporary MySQL...`);

  const forceExit = setTimeout(() => process.exit(1), 15_000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    const { sequelize } = require("../src/config/database");
    await sequelize.close().catch(() => {});

    const { closeOcrWorker } = require("../src/services/ocrService");
    await closeOcrWorker().catch(() => {});

    if (db) await db.stop();
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
}

async function main() {
  console.log("Starting a temporary MySQL 8.4 instance (first run may download it)...");

  db = await createDB({ version: "8.4.x", dbName: "scamshield_demo" });

  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_PORT = String(db.port);
  process.env.DB_NAME = db.dbName;
  process.env.DB_USER = db.username;
  process.env.DB_PASSWORD = "";
  process.env.DB_LOGGING = "false";

  // These modules read process.env when required, so load them only now.
  const env = require("../src/config/env");
  const { sequelize, testDatabaseConnection } = require("../src/config/database");
  const { ensureUploadDirectory } = require("../src/utils/fileStorage");
  const app = require("../src/app");

  await testDatabaseConnection();
  await runMigrations(sequelize);
  await ensureUploadDirectory();

  server = app.listen(env.port, () => {
    console.log("");
    console.log("============================================================");
    console.log("  ScamShield AI demo backend is ready");
    console.log(`  API:      http://localhost:${env.port}/api`);
    console.log(`  Health:   http://localhost:${env.port}/api/health`);
    console.log(`  Frontend: ${env.frontendOrigins.join(", ")}`);
    console.log("");
    console.log("  MySQL is temporary: accounts/scans reset on restart.");
    console.log("  Image scans use AI when configured, otherwise local OCR.");
    console.log("  Press Ctrl+C to stop everything.");
    console.log("============================================================");
    console.log("");
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${env.port} is already in use. Stop the other backend or change PORT in .env.`
      );
    } else {
      console.error("HTTP server error:", error.message);
    }
    shutdown("server error");
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch(async (error) => {
  console.error("\nDemo backend could not start.");
  console.error(error?.message || error);
  console.error("\nIf MySQL download failed, check your internet connection or use your own MySQL:");
  console.error("  npm run db:create && npm run db:migrate && npm run dev");
  await shutdown("startup failure");
});
