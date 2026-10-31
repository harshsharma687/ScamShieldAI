/**
 * Configuration used only by sequelize-cli for migrations.
 * The running application uses database.js instead.
 */
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "..", ".env"),
  quiet: true,
});

const common = {
  username: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "scam_shield_ai",
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  dialect: "mysql",
  timezone: "+00:00",
  logging: String(process.env.DB_LOGGING || "false").toLowerCase() === "true",
  define: {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  },
  dialectOptions: {
    charset: "utf8mb4",
  },
};

module.exports = {
  development: common,
  test: { ...common, database: `${common.database}_test` },
  production: common,
};
