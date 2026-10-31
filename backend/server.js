/**
 * Entry point. Run with:
 *   npm run dev     (nodemon, development)
 *   npm start       (production)
 */
const app = require("./src/app");
const env = require("./src/config/env");
const { sequelize, testDatabaseConnection } = require("./src/config/database");
const { ensureUploadDirectory } = require("./src/utils/fileStorage");

let server = null;
let shuttingDown = false;

function databaseHelp(error) {
  const code = error.original?.code || error.parent?.code;

  if (code === "ER_BAD_DB_ERROR") {
    return `The database "${env.database.name}" does not exist. Run: npm run db:create`;
  }

  if (code === "ER_ACCESS_DENIED_ERROR") {
    return "MySQL rejected the DB_USER / DB_PASSWORD in .env.";
  }

  if (code === "ECONNREFUSED") {
    return `No MySQL server is listening on ${env.database.host}:${env.database.port}. Start MySQL and try again.`;
  }

  return "Check DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD in .env.";
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${signal} received. Closing the server...`);

  const finish = async () => {
    try {
      await sequelize.close();
    } catch {
      // The pool may already be closed.
    }
    process.exit(0);
  };

  if (!server) return finish();

  server.close(finish);

  // Do not hang forever on keep-alive connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

async function start() {
  await testDatabaseConnection();
  await ensureUploadDirectory();

  server = app.listen(env.port, () => {
    console.log(`ScamShield AI API listening on http://localhost:${env.port}`);
    console.log(`Environment: ${env.nodeEnv}`);
    console.log(`Allowed frontend origin(s): ${env.frontendOrigins.join(", ")}`);

    if (!env.ai.apiKey) {
      console.warn(
        "[ai] AI_API_KEY is not set. Link/message scans use the labelled heuristic fallback; image scans use local OCR and are marked unverified."
      );
    }
    if (!env.safeBrowsingApiKey) {
      console.warn(
        "[threat-intel] SAFE_BROWSING_API_KEY is not set. No blacklist check will be claimed."
      );
    }
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${env.port} is already in use. Change PORT in .env or stop the other server.`
      );
    } else {
      console.error("HTTP server error:", error.message);
    }
    process.exit(1);
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => {
  console.error("[fatal] Unhandled promise rejection:", reason?.message || reason);
  shutdown("unhandledRejection");
});

start().catch(async (error) => {
  console.error("\nScamShield AI could not start.");
  console.error(`Reason: ${error.message}`);
  console.error(databaseHelp(error));
  console.error("\nNeed help? See README.md → MySQL setup.\n");

  try {
    await sequelize.close();
  } catch {
    // Ignore close errors during startup failure.
  }

  process.exit(1);
});
