/**
 * Central error handler. Controllers throw, this decides the safe HTTP
 * response. Internal details, SQL and provider responses never reach clients
 * in production.
 */
const multer = require("multer");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { sendError } = require("../utils/apiResponse");

function normalizeError(error) {
  // AppError and other explicitly operational errors (for example the AI
  // service) have messages that are safe to show to the client.
  if (
    error instanceof AppError ||
    (error.isOperational && Number.isInteger(error.statusCode))
  ) {
    return {
      status: error.statusCode,
      message: error.message,
      errors: error.errors || undefined,
      code: error.code || "APP_ERROR",
    };
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return {
        status: 413,
        message: `Image is too large. Maximum size is ${Math.round(
          env.uploads.maxImageBytes / (1024 * 1024)
        )} MB.`,
        code: "FILE_TOO_LARGE",
      };
    }

    return {
      status: 400,
      message:
        error.code === "LIMIT_UNEXPECTED_FILE"
          ? 'Unexpected upload field. Send one file in the "image" field.'
          : "The file upload could not be processed.",
      code: "UPLOAD_ERROR",
    };
  }

  if (error.name === "SequelizeUniqueConstraintError") {
    return {
      status: 409,
      message: "A record with that value already exists.",
      code: "DUPLICATE_RECORD",
    };
  }

  if (error.name === "SequelizeValidationError") {
    return {
      status: 422,
      message: "The submitted data is invalid.",
      code: "VALIDATION_ERROR",
      errors: error.errors.map((item) => ({
        field: item.path,
        message: item.message,
      })),
    };
  }

  if (error.name === "SequelizeForeignKeyConstraintError") {
    return {
      status: 409,
      message: "This action conflicts with related data.",
      code: "FOREIGN_KEY_CONFLICT",
    };
  }

  if (error.name === "SequelizeConnectionError") {
    return {
      status: 503,
      message: "The database is temporarily unavailable. Please try again.",
      code: "DATABASE_UNAVAILABLE",
    };
  }

  if (error.type === "entity.too.large") {
    return {
      status: 413,
      message: "Request body is too large.",
      code: "PAYLOAD_TOO_LARGE",
    };
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return {
      status: 400,
      message: "Malformed JSON in the request body.",
      code: "INVALID_JSON",
    };
  }

  if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
    return {
      status: 401,
      message: "Authentication failed. Please sign in again.",
      code: "TOKEN_INVALID",
    };
  }

  return {
    status: error.statusCode && error.statusCode >= 400 ? error.statusCode : 500,
    message: env.isProduction
      ? "Something went wrong. Please try again later."
      : error.message || "Something went wrong.",
    code: "INTERNAL_ERROR",
  };
}

// eslint-disable-next-line no-unused-vars
function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const { status, message, errors, code } = normalizeError(error);

  // Log server faults, never request bodies, tokens or provider payloads.
  // Expected operational failures (missing AI/email configuration) are logged
  // as a single line; unexpected faults keep the stack in development.
  if (status >= 500 && !env.isTest) {
    const detail =
      env.isProduction || error.isOperational ? "" : `\n${error.stack || ""}`;
    console.error(
      `[error] ${req.id || "-"} ${req.method} ${req.path} -> ${status}: ${error.message}${detail}`
    );
  }

  return sendError(res, status, message, errors, code);
}

function notFoundHandler(req, res) {
  return sendError(res, 404, "Route not found.", undefined, "ROUTE_NOT_FOUND");
}

module.exports = { errorMiddleware, notFoundHandler };
