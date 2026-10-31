/**
 * Every successful endpoint returns the same envelope:
 *   { success: true, message: "...", data: {...}, meta?: {...} }
 */
function sendSuccess(res, statusCode, message, data = null, meta = undefined) {
  const body = { success: true, message };

  if (data !== null && data !== undefined) body.data = data;
  if (meta !== undefined) body.meta = meta;

  return res.status(statusCode).json(body);
}

/**
 * Errors use the same predictable shape, optionally with field-level details.
 * Internal stack traces are never included here.
 */
function sendError(res, statusCode, message, errors = undefined, code = undefined) {
  const body = { success: false, message };

  if (errors) body.errors = errors;
  if (code) body.code = code;

  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess, sendError };
