const { body, param } = require("express-validator");

const emailRule = body("email")
  .isString()
  .withMessage("Email must be text.")
  .trim()
  .isEmail()
  .withMessage("Enter a valid email address.")
  .isLength({ max: 191 })
  .withMessage("Email is too long.")
  .customSanitizer((value) => String(value).trim().toLowerCase());

const passwordRule = body("password")
  .isString()
  .withMessage("Password must be text.")
  .isLength({ min: 8, max: 72 })
  .withMessage("Password must be between 8 and 72 characters.")
  .custom((value) => Buffer.byteLength(String(value), "utf8") <= 72)
  .withMessage("Password must be at most 72 bytes (bcrypt's limit).")
  .matches(/[A-Za-z]/)
  .withMessage("Password must contain at least one letter.")
  .matches(/\d/)
  .withMessage("Password must contain at least one number.");

const newPasswordRule = body("newPassword")
  .isString()
  .withMessage("New password must be text.")
  .isLength({ min: 8, max: 72 })
  .withMessage("New password must be between 8 and 72 characters.")
  .custom((value) => Buffer.byteLength(String(value), "utf8") <= 72)
  .withMessage("New password must be at most 72 bytes (bcrypt's limit).")
  .matches(/[A-Za-z]/)
  .withMessage("New password must contain at least one letter.")
  .matches(/\d/)
  .withMessage("New password must contain at least one number.");

const nameRule = body("name")
  .isString()
  .withMessage("Name must be text.")
  .trim()
  .isLength({ min: 2, max: 80 })
  .withMessage("Name must be between 2 and 80 characters.")
  .matches(/^[\p{L}\p{M} .'-]+$/u)
  .withMessage("Name contains unsupported characters.");

const registerValidator = [nameRule, emailRule, passwordRule];

const loginValidator = [
  emailRule,
  body("password")
    .isString()
    .withMessage("Password must be text.")
    .notEmpty()
    .withMessage("Password is required.")
    .isLength({ max: 72 })
    .withMessage("Password is too long."),
];

const forgotPasswordValidator = [emailRule];

const resetPasswordValidator = [
  body("token")
    .isString()
    .withMessage("Reset token is required.")
    .isHexadecimal()
    .withMessage("Reset token is invalid.")
    .isLength({ min: 64, max: 64 })
    .withMessage("Reset token is invalid."),
  passwordRule,
];

const verifyEmailValidator = [
  body("token")
    .isString()
    .withMessage("Verification token is required.")
    .isHexadecimal()
    .withMessage("Verification token is invalid.")
    .isLength({ min: 64, max: 64 })
    .withMessage("Verification token is invalid."),
];

const updateProfileValidator = [
  body("name").optional().isString().trim().isLength({ min: 2, max: 80 }).withMessage("Name must be between 2 and 80 characters."),
  body("email").optional().isString().trim().isEmail().withMessage("Enter a valid email address.").isLength({ max: 191 }),
  body("profileImage")
    .optional({ nullable: true })
    .isString()
    .withMessage("Profile image must be a URL string.")
    .isLength({ max: 2048 })
    .withMessage("Profile image URL is too long."),
  body("currentPassword")
    .optional()
    .isString()
    .withMessage("Current password must be text.")
    .isLength({ max: 72 }),
];

const changePasswordValidator = [
  body("currentPassword")
    .isString()
    .withMessage("Current password is required.")
    .notEmpty()
    .withMessage("Current password is required.")
    .isLength({ max: 72 }),
  newPasswordRule,
];

const deleteAccountValidator = [
  body("password")
    .isString()
    .withMessage("Password is required to delete your account.")
    .notEmpty()
    .withMessage("Password is required to delete your account.")
    .isLength({ max: 72 }),
];

const sessionParamValidator = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Session id must be a positive number.")
    .toInt(),
];

module.exports = {
  emailRule,
  passwordRule,
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyEmailValidator,
  updateProfileValidator,
  changePasswordValidator,
  deleteAccountValidator,
  sessionParamValidator,
};
