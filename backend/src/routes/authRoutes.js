const express = require("express");
const authController = require("../controllers/authController");
const { validate } = require("../middlewares/validationMiddleware");
const { protect } = require("../middlewares/authMiddleware");
const {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  refreshLimiter,
} = require("../middlewares/rateLimitMiddleware");
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyEmailValidator,
} = require("../validators/authValidator");

const router = express.Router();

router.post(
  "/register",
  registerLimiter,
  validate(registerValidator),
  authController.register
);

router.post("/login", loginLimiter, validate(loginValidator), authController.login);

router.post("/refresh", refreshLimiter, authController.refresh);

router.post("/logout", authController.logout);

router.post(
  "/forgot-password",
  passwordResetLimiter,
  validate(forgotPasswordValidator),
  authController.forgotPassword
);

router.post(
  "/reset-password",
  passwordResetLimiter,
  validate(resetPasswordValidator),
  authController.resetPassword
);

router.post(
  "/verify-email",
  validate(verifyEmailValidator),
  authController.verifyEmailChange
);

router.get("/me", protect, authController.getCurrentUser);

module.exports = router;
