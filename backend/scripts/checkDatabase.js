/**
 * Checks the configured MySQL server end to end:
 *
 *   npm run db:check
 *
 * Works for local MySQL and for a hosted server (set DB_SSL=true). It prints
 * only non-secret details — never the password — and exits non-zero when the
 * connection or the schema is not usable.
 */
require("dotenv").config({ quiet: true });

const mysql = require("mysql2/promise");
const env = require("../src/config/env");
const { buildMysqlSslOptions } = require("../src/config/mysqlSsl");

const REQUIRED_TABLES = ["users", "scans", "detection_results", "refresh_tokens"];
const REQUIRED_COLUMNS = [
  ["scans", "file_public_id"],
  ["users", "profile_image_public_id"],
  ["detection_results", "explanation_hi"],
  ["detection_results", "explanation_en"],
];

async function main() {
  const ssl = buildMysqlSslOptions();

  console.log("Host     :", env.database.host);
  console.log("Port     :", env.database.port);
  console.log("Database :", env.database.name);
  console.log("User     :", env.database.user);
  console.log("TLS      :", env.database.ssl ? "on" : "off");

  const connection = await mysql.createConnection({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.name,
    ...(ssl ? { ssl } : {}),
    connectTimeout: 15000,
  });

  const [[version]] = await connection.query("SELECT VERSION() AS version, DATABASE() AS db");
  console.log("Server   :", version.version, "| connected to:", version.db);

  const [tables] = await connection.query("SHOW TABLES");
  const tableNames = tables.map((row) => Object.values(row)[0]);
  const missingTables = REQUIRED_TABLES.filter((name) => !tableNames.includes(name));

  console.log("Tables   :", tableNames.join(", ") || "(none)");

  if (missingTables.length) {
    console.error("\nMissing tables:", missingTables.join(", "), "-> run: npm run db:migrate");
  } else {
    for (const table of REQUIRED_TABLES) {
      const [[{ n }]] = await connection.query(`SELECT COUNT(*) AS n FROM ${table}`);
      console.log(`  ${table}: ${n} rows`);
    }
  }

  for (const [table, column] of REQUIRED_COLUMNS) {
    if (!tableNames.includes(table)) continue;

    const [rows] = await connection.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
      [table, column]
    );

    if (!rows.length) {
      console.error(`Missing column ${table}.${column} -> run: npm run db:migrate`);
    }
  }

  const [migrations] = await connection
    .query("SELECT name FROM SequelizeMeta ORDER BY name")
    .catch(() => [[]]);
  console.log("Migrations applied:", migrations.length);

  await connection.end();

  if (missingTables.length) process.exitCode = 1;
  console.log("\nDatabase check passed.");
}

main().catch((error) => {
  console.error("\nDatabase check failed:", error.code || error.message);
  console.error(
    "Check DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD (and DB_SSL for a hosted server) in backend/.env."
  );
  process.exitCode = 1;
});
