const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const env = require("./config/env");
const { sequelize } = require("./config/database");
const AppError = require("./utils/AppError");
const asyncHandler = require("./utils/asyncHandler");
const { sendSuccess } = require("./utils/apiResponse");
const { errorMiddleware, notFoundHandler } = require("./middlewares/errorMiddleware");
const { generalLimiter } = require("./middlewares/rateLimitMiddleware");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const scanRoutes = require("./routes/scanRoutes");
const historyRoutes = require("./routes/historyRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const settingsController = require("./controllers/settingsController");

const app = express();

app.disable("x-powered-by");

// Only enable this when a trusted reverse proxy sits in front of the API.
// Otherwise clients could spoof X-Forwarded-For and bypass rate limits.
if (env.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(helmet());

const allowedOrigins = new Set(env.frontendOrigins);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header means curl, Postman or a same-origin request.
      if (!origin) return callback(null, true);

      if (allowedOrigins.has(origin)) return callback(null, true);

      // Convenient for local development on any Vite port. Production only
      // accepts the explicit FRONTEND_URL list.
      if (
        !env.isProduction &&
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(
        new AppError("This origin is not allowed to call the API.", 403, {
          code: "CORS_BLOCKED",
        })
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy"],
    maxAge: 86400,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
});

if (!env.isProduction) {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    // Capture the path now: Express rewrites req.url inside mounted routers.
    // The query string is intentionally excluded because it can contain
    // user-entered search text.
    const requestPath = req.originalUrl.split("?")[0];

    res.on("finish", () => {
      console.log(
        `${req.method} ${requestPath} ${res.statusCode} ${Date.now() - startedAt}ms`
      );
    });

    next();
  });
}

app.get(
  "/api/health",
  asyncHandler(async (req, res) => {
    await sequelize.authenticate();

    return sendSuccess(res, 200, "ScamShield AI API is running.", {
      status: "ok",
      database: "connected",
      environment: env.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  })
);

// Authenticated API responses are private and must never be stored by a
// browser cache or shared proxy.
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

app.use("/api", generalLimiter);

// Stored profile photos. Public by design: the random filename is the secret,
// so a photo can never be reached by guessing an account id.
app.get("/api/avatars/:filename", settingsController.serveAvatar);

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/scans", scanRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/settings", settingsRoutes);

app.use(notFoundHandler);
app.use(errorMiddleware);

module.exports = app;
