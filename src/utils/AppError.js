/**
 * An error we deliberately throw when the client should receive a specific
 * HTTP status and a safe, human-readable message.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options.code || "APP_ERROR";
    this.errors = options.errors || null;
    this.isOperational = true;
    this.expose = options.expose !== false;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
