const express = require("express");
const scanImageController = require("../controllers/scanImageController");
const scanLinkController = require("../controllers/scanLinkController");
const scanMessageController = require("../controllers/scanMessageController");
const historyController = require("../controllers/historyController");
const { protect } = require("../middlewares/authMiddleware");
const { uploadImage } = require("../middlewares/uploadMiddleware");
const { scanLimiter } = require("../middlewares/rateLimitMiddleware");
const { validate } = require("../middlewares/validationMiddleware");
const {
  linkScanValidator,
  messageScanValidator,
  idParamValidator,
} = require("../validators/scanValidator");
const { requireScanType } = require("../services/scanService");

const router = express.Router();

router.use(protect);

router.post(
  "/image",
  scanLimiter,
  uploadImage,
  scanImageController.scanImage
);

router.post(
  "/link",
  scanLimiter,
  validate(linkScanValidator),
  scanLinkController.scanLink
);

router.post(
  "/message",
  scanLimiter,
  validate(messageScanValidator),
  scanMessageController.scanMessage
);

// Type-specific read aliases. The generic /:id route covers every scan type.
router.get(
  "/image/:id",
  validate(idParamValidator),
  requireScanType("image"),
  historyController.getScan
);

router.get(
  "/link/:id",
  validate(idParamValidator),
  requireScanType("link"),
  historyController.getScan
);

router.get(
  "/message/:id",
  validate(idParamValidator),
  requireScanType("message"),
  historyController.getScan
);

router.get("/:id/file", validate(idParamValidator), historyController.getScanFile);

router.get("/:id", validate(idParamValidator), historyController.getScan);

module.exports = router;
