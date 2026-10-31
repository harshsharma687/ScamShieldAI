const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { sendSuccess } = require("../utils/apiResponse");
const { Scan, DetectionResult } = require("../models");
const { getOwnedScan } = require("../services/scanService");
const { serializeScan } = require("../utils/serializers");
const { resolveUploadPath, deleteUpload } = require("../utils/fileStorage");
const { destroyImage } = require("../services/cloudStorageService");

const RISK_LEVELS = ["Low", "Medium", "High", "Critical"];

function normalizeRiskLevel(value) {
  if (!value) return null;
  const match = RISK_LEVELS.find(
    (level) => level.toLowerCase() === String(value).toLowerCase()
  );
  return match || null;
}

const listHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;

  const where = { userId: req.userId };

  if (req.query.type) where.scanType = req.query.type;
  if (req.query.status) where.status = req.query.status;

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  if (search) {
    // Sequelize parameterises this value; wildcard characters are escaped so
    // they match literally instead of turning the search into a pattern.
    const literal = search.replace(/[\\%_]/g, "\\$&");
    where.inputValue = { [Op.like]: `%${literal}%` };
  }

  const riskLevel = normalizeRiskLevel(req.query.riskLevel);
  const resultInclude = {
    model: DetectionResult,
    as: "detectionResults",
    required: Boolean(riskLevel),
  };

  if (riskLevel) {
    resultInclude.where = { riskLevel };
  }

  const { count, rows } = await Scan.findAndCountAll({
    where,
    include: [resultInclude],
    order: [["createdAt", req.query.sort === "oldest" ? "ASC" : "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  const totalPages = count === 0 ? 0 : Math.ceil(count / limit);

  return sendSuccess(
    res,
    200,
    "Scan history loaded.",
    { scans: rows.map(serializeScan) },
    {
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: {
        type: req.query.type || null,
        riskLevel: riskLevel || null,
        status: req.query.status || null,
        search: search || null,
        sort: req.query.sort || "newest",
      },
    }
  );
});

const getScan = asyncHandler(async (req, res) => {
  const scan = await getOwnedScan(req.userId, req.params.id);

  // A 404 avoids confirming that another user's scan exists.
  if (!scan || (req.expectedScanType && scan.scanType !== req.expectedScanType)) {
    throw new AppError("Scan not found.", 404, { code: "SCAN_NOT_FOUND" });
  }

  return sendSuccess(res, 200, "Scan loaded.", { scan: serializeScan(scan) });
});

const getScanFile = asyncHandler(async (req, res) => {
  const scan = await Scan.findOne({
    where: { id: req.params.id, userId: req.userId },
    attributes: ["id", "fileUrl", "scanType"],
  });

  if (!scan || !scan.fileUrl) {
    throw new AppError("No image is stored for this scan.", 404, {
      code: "FILE_NOT_FOUND",
    });
  }

  // Cloud-stored images are served by Cloudinary. The URL stays unguessable,
  // and this route still proves the caller owns the scan before redirecting.
  if (/^https:\/\//i.test(scan.fileUrl)) {
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.redirect(302, scan.fileUrl);
  }

  const absolutePath = resolveUploadPath(scan.fileUrl);

  if (!absolutePath) {
    throw new AppError("No image is stored for this scan.", 404, {
      code: "FILE_NOT_FOUND",
    });
  }

  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
  } catch {
    throw new AppError("No image is stored for this scan.", 404, {
      code: "FILE_NOT_FOUND",
    });
  }

  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = extension === ".png" ? "image/png" : "image/jpeg";

  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `inline; filename="scan-${scan.id}${extension}"`);
  res.type(contentType);

  return res.sendFile(absolutePath);
});

const deleteScan = asyncHandler(async (req, res) => {
  const scan = await Scan.findOne({
    where: { id: req.params.id, userId: req.userId },
    attributes: ["id", "fileUrl", "filePublicId"],
  });

  if (!scan) {
    throw new AppError("Scan not found.", 404, { code: "SCAN_NOT_FOUND" });
  }

  const file = scan.fileUrl;
  const publicId = scan.filePublicId;
  await scan.destroy();

  if (publicId) {
    await destroyImage(publicId).catch(() => {});
  } else if (file) {
    try {
      await deleteUpload(file);
    } catch {
      // The database row is already gone; an orphaned file can be cleaned up
      // by maintenance without failing the request.
    }
  }

  return sendSuccess(res, 200, "Scan deleted successfully.", { id: scan.id });
});

const deleteAllHistory = asyncHandler(async (req, res) => {
  const scans = await Scan.findAll({
    where: { userId: req.userId },
    attributes: ["id", "fileUrl", "filePublicId"],
  });

  const deletedCount = await Scan.destroy({ where: { userId: req.userId } });

  await Promise.allSettled(
    scans
      .filter((scan) => scan.fileUrl)
      .map((scan) =>
        scan.filePublicId
          ? destroyImage(scan.filePublicId)
          : deleteUpload(scan.fileUrl)
      )
  );

  return sendSuccess(res, 200, "Scan history deleted.", { deletedCount });
});

module.exports = {
  listHistory,
  getScan,
  getScanFile,
  deleteScan,
  deleteAllHistory,
};
