/**
 * Runtime database connection.
 *
 * Sequelize is the ORM: it builds parameterised SQL for us, which protects
 * against SQL injection, and it maps rows to JavaScript objects using models.
 */
const { Sequelize } = require("sequelize");
const env = require("./env");
const { buildMysqlSslOptions } = require("./mysqlSsl");

const sslOptions = buildMysqlSslOptions();

const sequelize = new Sequelize(
  env.database.name,
  env.database.user,
  env.database.password,
  {
    host: env.database.host,
    port: env.database.port,
    dialect: "mysql",
    logging: env.database.logging
      ? (message) => console.log(`[SQL] ${message}`)
      : false,
    timezone: "+00:00",
    define: {
      // JavaScript camelCase fields are stored as snake_case MySQL columns.
      underscored: true,
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci",
    },
    pool: {
      max: env.database.poolMax,
      min: 0,
      acquire: 30_000,
      idle: 10_000,
    },
    dialectOptions: {
      charset: "utf8mb4",
      // Hosted providers require TLS; local MySQL does not set DB_SSL.
      ...(sslOptions ? { ssl: sslOptions } : {}),
    },
  }
);

async function testDatabaseConnection() {
  await sequelize.authenticate();
}

module.exports = { sequelize, testDatabaseConnection };
