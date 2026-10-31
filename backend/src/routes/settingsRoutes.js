const express = require("express");
const settingsController = require("../controllers/settingsController");
const { protect } = require("../middlewares/authMiddleware");
const { upload } = require("../middlewares/uploadMiddleware");
const { validate } = require("../middlewares/validationMiddleware");
const {
  updateProfileValidator,
  changePasswordValidator,
  deleteAccountValidator,
  sessionParamValidator,
} = require("../validators/authValidator");

const router = express.Router();

const uploadAvatar = upload.single("avatar");

router.use(protect);

router.get("/profile", settingsController.getProfile);

router.put(
  "/profile",
  validate(updateProfileValidator),
  settingsController.updateProfile
);

router.put(
  "/change-password",
  validate(changePasswordValidator),
  settingsController.changePassword
);

// Profile photo: uploaded, re-encoded server-side, then removed on request.
router.post("/avatar", uploadAvatar, settingsController.uploadAvatar);
router.delete("/avatar", settingsController.removeAvatar);

// Sessions make it possible to sign out a device that was left signed in.
router.get("/sessions", settingsController.listSessions);
router.delete("/sessions", settingsController.revokeOtherSessions);
router.delete(
  "/sessions/:id",
  validate(sessionParamValidator),
  settingsController.revokeSession
);

// One-click copy of everything this account owns (JSON download).
router.get("/export", settingsController.exportData);

router.delete(
  "/account",
  validate(deleteAccountValidator),
  settingsController.deleteAccount
);

module.exports = router;
