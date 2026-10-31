/**
 * Creates the MySQL database named in .env if it does not exist.
 * Usage: npm run db:create
 */
const mysql = require("mysql2/promise");
const env = require("../src/config/env");

async function main() {
  if (!/^[A-Za-z0-9_]+$/.test(env.database.name)) {
    throw new Error(
      "DB_NAME may only contain letters, numbers and underscores."
    );
  }

  const connection = await mysql.createConnection({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.database.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`Database "${env.database.name}" is ready.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Could not create the database.");
  console.error(`Reason: ${error.message}`);
  console.error("Check that MySQL is running and the DB_* values in .env are correct.");
  process.exit(1);
});
