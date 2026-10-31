const { body, param, query } = require("express-validator");

const linkScanValidator = [
  body("url")
    .isString()
    .withMessage("URL must be text.")
    .trim()
    .notEmpty()
    .withMessage("A website URL is required.")
    .isLength({ max: 2048 })
    .withMessage("URL is too long (maximum 2048 characters)."),
];

const messageScanValidator = [
  body("message")
    .isString()
    .withMessage("Message must be text.")
    .trim()
    .notEmpty()
    .withMessage("A message is required.")
    .isLength({ max: 5000 })
    .withMessage("Message is too long (maximum 5000 characters)."),
];

const idParamValidator = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Scan ID must be a positive number.")
    .toInt(),
];

const historyQueryValidator = [
  query("page").optional().isInt({ min: 1, max: 1_000_000 }).withMessage("Page must be a positive number."),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100."),
  query("type")
    .optional()
    .isIn(["image", "link", "message"])
    .withMessage("Type must be image, link or message."),
  query("riskLevel")
    .optional()
    .isIn(["low", "medium", "high", "critical", "Low", "Medium", "High", "Critical"])
    .withMessage("Risk level must be Low, Medium, High or Critical."),
  query("sort")
    .optional()
    .isIn(["newest", "oldest"])
    .withMessage("Sort must be newest or oldest."),
  query("search")
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage("Search text must be 100 characters or fewer."),
  query("status")
    .optional()
    .isIn(["pending", "completed", "failed"])
    .withMessage("Status must be pending, completed or failed."),
];

module.exports = {
  linkScanValidator,
  messageScanValidator,
  idParamValidator,
  historyQueryValidator,
};
