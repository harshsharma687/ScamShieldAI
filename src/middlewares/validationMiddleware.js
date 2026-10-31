const { validationResult } = require("express-validator");
const { sendError } = require("../utils/apiResponse");

/**
 * Runs express-validator chains and converts failures into the standard 422
 * response with per-field messages.
 */
function validate(validations) {
  return async function validationHandler(req, res, next) {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const result = validationResult(req);

    if (result.isEmpty()) {
      return next();
    }

    return sendError(
      res,
      422,
      "Validation failed. Please check the highlighted fields.",
      result.array().map((item) => ({
        field: item.path,
        location: item.location,
        message: item.msg,
      })),
      "VALIDATION_ERROR"
    );
  };
}

module.exports = { validate };
