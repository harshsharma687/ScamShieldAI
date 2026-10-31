/**
 * TLS options for a hosted MySQL server.
 *
 * Local MySQL normally runs without TLS, while managed providers (Aiven,
 * Railway, TiDB Cloud, PlanetScale) require an encrypted connection. Enable it
 * with DB_SSL=true. If the provider gives you a CA certificate, point
 * DB_SSL_CA_PATH at the file and the certificate is verified properly.
 */
const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");

function buildMysqlSslOptions(env = process.env) {
  if (String(env.DB_SSL || "").toLowerCase() !== "true") return null;

  const caPath = env.DB_SSL_CA_PATH;

  if (!caPath) {
    // Encrypted, but the provider's certificate chain is not checked. Fine for
    // providers whose CA you cannot download (Railway, some free tiers).
    return { rejectUnauthorized: false };
  }

  const resolved = path.isAbsolute(caPath)
    ? caPath
    : path.resolve(BACKEND_ROOT, caPath);

  return {
    ca: fs.readFileSync(resolved, "utf8"),
    rejectUnauthorized: true,
  };
}

module.exports = { buildMysqlSslOptions };
