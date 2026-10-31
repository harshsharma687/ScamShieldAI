const express = require("express");
const historyController = require("../controllers/historyController");
const { protect } = require("../middlewares/authMiddleware");
const { validate } = require("../middlewares/validationMiddleware");
const {
  idParamValidator,
  historyQueryValidator,
} = require("../validators/scanValidator");

const router = express.Router();

router.use(protect);

router.get("/", validate(historyQueryValidator), historyController.listHistory);

router.delete("/", historyController.deleteAllHistory);

router.get("/:id", validate(idParamValidator), historyController.getScan);

router.delete("/:id", validate(idParamValidator), historyController.deleteScan);

module.exports = router;
