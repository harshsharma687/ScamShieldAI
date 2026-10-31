# ScamShield AI — Backend

A complete REST API for the ScamShield AI React frontend.

- **Runtime:** Node.js + Express 5 (CommonJS)
- **Database:** MySQL 8 + Sequelize ORM + real migrations
- **Auth:** JWT access tokens + rotating, revocable refresh tokens in HTTP-only cookies
- **Scans:** image, link and message, with evidence-based detection
- **Security:** Helmet, CORS allow-list, rate limiting, validation, protected uploads, SSRF blocking, centralized errors

> The backend never claims that an item is safe just because a check could not run. When the AI provider is unavailable, link/message results are marked `verified: false` with the `heuristic-fallback` source. Image scans read visible text locally with OCR and are marked `verified: false` with the `ocr-fallback` source. OCR cannot judge layout, logos or QR codes, and the UI says so.

---

## 0. Fastest way to run the demo (no MySQL password needed)

Use this when you want to see the app working immediately. It starts a temporary **real MySQL 8.4** instance, runs the migrations, and starts the API on port 5000. Use the normal `npm run dev` with your own MySQL when you need data to survive a restart.

**Terminal 1 — backend:**

```powershell
cd backend
npm install
npm run dev:demo
```

Wait until you see `ScamShield AI demo backend is ready` and `http://localhost:5000`.

**Terminal 2 — frontend:**

```powershell
cd frontend\frontend
npm install
npm run dev
```

Open <http://localhost:5173>, click **Create account**, and sign up. The temp MySQL database is deleted when you press `Ctrl+C`, so accounts and scans reset on the next demo start.

> If the backend prints `http://localhost:0`, your terminal has exported `PORT=0`. The app now prefers the valid `PORT` from `.env`; set `PORT=5000` in `.env` and restart.

---

## 1. What was connected in the existing frontend

| Existing page / component | What it now uses |
|---|---|
| Dashboard statistics | `GET /api/dashboard/stats` — real MySQL counts for the signed-in user |
| Dashboard recent scans | `GET /api/dashboard/recent-scans` |
| Dashboard alerts / donut | Derived from the user's real scans |
| Quick Scan message modal | `POST /api/scans/message` |
| Quick Scan link modal | `POST /api/scans/link` |
| Dashboard Upload File | JPG/PNG → `POST /api/scans/image` (PDF/TXT are not analyzed and say so) |
| Scan Image page | `POST /api/scans/image` with loading and error states |
| Scan Link page | `POST /api/scans/link` |
| Scan Message page | `POST /api/scans/message` |
| Scan History page | `GET /api/history` (no more `localStorage`) |
| Top bar | Real user name/email + Sign out |
| Sign in / register | **Guest-first modal**: visitors browse the Dashboard and scan pages without logging in; sign-in is requested only when they scan or open History/Settings |

The original layout, colours, typography and component CSS are preserved. No page was redesigned. Guest statistics are real zeros, not demo numbers, and signing out immediately hides the previous account's counts.

### Frontend files added or changed

| File | Purpose |
|---|---|
| `frontend/frontend/src/services/api.js` | Axios instance, access-token handling, silent refresh, all API calls |
| `frontend/frontend/src/context/authContext.js` | Shared auth context object |
| `frontend/frontend/src/context/AuthProvider.jsx` | Session bootstrap, login/register/logout state |
| `frontend/frontend/src/context/useAuth.js` | `useAuth()` hook |
| `frontend/frontend/src/components/AuthGate.jsx` + `.css` | Minimal sign-in / create-account gate |
| `frontend/frontend/src/utils/format.js` | Date and status-class helpers |
| `frontend/frontend/src/App.jsx` | Live dashboard, API-powered quick scans, real user top bar |
| `ScanImage.jsx`, `ScanLink.jsx`, `ScanMessage.jsx` | Backend calls and real result cards |
| `ScanHistory.jsx` | Database history instead of browser storage |
| `frontend/frontend/.env.example` | `VITE_API_URL` |

The existing `ScanFile.jsx` is left in place, but PDF/TXT analysis is outside the requested image/link/message backend scope. The Settings nav still renders the original placeholder because the frontend contains **no settings form**; all Settings APIs are implemented and documented below.

---

## 2. Folder structure (beginner-friendly)

```text
backend/
├── src/
│   ├── config/
│   │   ├── env.js              # Reads .env once, validates secrets and numbers
│   │   ├── database.js         # Sequelize connection + connection pool
│   │   └── sequelizeCli.js     # Config used only by sequelize-cli migrations
│   ├── controllers/
│   │   ├── authController.js       # register/login/refresh/logout/reset/verify/me
│   │   ├── dashboardController.js  # per-user counts and recent scans
│   │   ├── scanImageController.js  # upload validation + image scan
│   │   ├── scanLinkController.js   # URL normalization + link scan
│   │   ├── scanMessageController.js# message scan
│   │   ├── historyController.js    # list/filter/get/delete/file download
│   │   └── settingsController.js   # profile/password/account deletion
│   ├── models/
│   │   ├── User.js             # users table + safe JSON serialization
│   │   ├── Scan.js             # scans table, belongs to User
│   │   ├── DetectionResult.js  # verdict for a scan
│   │   ├── RefreshToken.js     # hashed refresh sessions
│   │   └── index.js            # one Sequelize instance + relationships
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── scanRoutes.js
│   │   ├── historyRoutes.js
│   │   └── settingsRoutes.js
│   ├── middlewares/
│   │   ├── authMiddleware.js       # verifies Bearer access token
│   │   ├── errorMiddleware.js      # central error handler + 404
│   │   ├── uploadMiddleware.js     # Multer memory upload, 10 MB limit
│   │   ├── validationMiddleware.js # express-validator → 422
│   │   └── rateLimitMiddleware.js  # login/register/reset/scan/global limits
│   ├── services/
│   │   ├── aiDetectionService.js   # OpenAI-compatible AI provider
│   │   ├── imageDetectionService.js# decode/resize/strip EXIF + vision scan / OCR fallback
│   │   ├── ocrService.js           # local Tesseract OCR, serialised worker
│   │   ├── urlDetectionService.js  # SSRF blocking, URL signals, Safe Browsing
│   │   ├── messageDetectionService.js # evidence rules + AI
│   │   ├── emailService.js         # SMTP reset / email-change messages
│   │   ├── refreshTokenService.js  # rotation + reuse detection
│   │   └── scanService.js          # shared scan save/complete/fail logic
│   ├── validators/
│   │   ├── authValidator.js        # email, password, profile, account rules
│   │   └── scanValidator.js        # link, message, ID, history query rules
│   ├── utils/
│   │   ├── AppError.js             # error with HTTP status + safe code
│   │   ├── asyncHandler.js         # async errors → error middleware
│   │   ├── apiResponse.js          # { success, message, data } format
│   │   ├── generateToken.js        # JWT + refresh cookie + hashing
│   │   ├── risk.js                 # 0-100 → Low/Medium/High/Critical
│   │   ├── serializers.js          # hides secrets/internal file paths
│   │   └── fileStorage.js          # magic-byte checks, safe writes/paths
│   ├── migrations/                 # The four CREATE TABLE migrations
│   ├── app.js                      # Express app (no listening)
│   └── ...
├── scripts/
│   ├── createDatabase.js       # `npm run db:create`
│   └── devDemo.js              # `npm run dev:demo` (temporary MySQL + API)
├── tests/
│   ├── risk.test.js
│   ├── urlDetection.test.js
│   ├── messageDetection.test.js
│   └── integration/api.test.js # real ephemeral MySQL 8.4 + supertest
├── postman/
│   ├── ScamShield-AI.postman_collection.json
│   ├── ScamShield-AI.postman_environment.json
│   └── sample-image.png        # for the image upload request
├── uploads/                    # private files; never served statically
├── .env                        # real secrets (git-ignored)
├── .env.example                # documented template
├── .gitignore
├── .sequelizerc                # tells sequelize-cli where migrations live
├── package.json
├── server.js                   # starts MySQL connection + HTTP server
└── README.md
```

---

## 3. Windows PowerShell setup

### 3.1 Install prerequisites

1. Install **Node.js 20+** from <https://nodejs.org> (LTS).
2. Install **MySQL Community Server 8.x** from <https://dev.mysql.com/downloads/installer/>.
   - Choose **MySQL Server** and **MySQL Workbench**.
   - Remember the `root` password.
   - Keep the default port `3306`.
3. Verify in PowerShell:

```powershell
node --version
npm --version
mysql --version
Get-Service -Name MySQL*
```

If the service is stopped:

```powershell
Start-Service MySQL80
```

> XAMPP works too: start **MySQL** in the XAMPP control panel and use its `mysql.exe` or phpMyAdmin.

### 3.2 Create the database

Option A — helper script (after `.env` is configured):

```powershell
cd backend
npm run db:create
```

Option B — MySQL command line:

```powershell
mysql -u root -p -e "CREATE DATABASE scam_shield_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Recommended dedicated user (run in MySQL Workbench or the `mysql` prompt):

```sql
CREATE DATABASE IF NOT EXISTS scam_shield_ai
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'scamshield'@'localhost' IDENTIFIED BY 'replace-with-a-strong-password';
GRANT ALL PRIVILEGES ON scam_shield_ai.* TO 'scamshield'@'localhost';
FLUSH PRIVILEGES;
```

Then set `DB_USER=scamshield` and `DB_PASSWORD=...` in `.env`.

### 3.3 Install and configure the backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Generate two different JWT secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Open the file and fill in the values:

```powershell
notepad .env
```

Minimum local `.env`:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_NAME=scam_shield_ai
DB_USER=root
DB_PASSWORD=your-mysql-password

JWT_ACCESS_SECRET=<first-long-random-value>
JWT_REFRESH_SECRET=<second-long-random-value>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

FRONTEND_URL=http://localhost:5173
```

Run the tables:

```powershell
npm run db:create
npm run db:migrate
npm run dev
```

Expected output:

```text
ScamShield AI API listening on http://localhost:5000
Environment: development
```

Check it:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

You should see `success: true` and `database: connected`.

### 3.4 Useful database commands

```powershell
npm run db:migrate          # apply pending migrations
npm run db:migrate:undo     # roll back the last migration
npm run db:reset            # undo all + migrate again (destroys data)
```

Verify tables in MySQL:

```sql
USE scam_shield_ai;
SHOW TABLES;
DESCRIBE users;
DESCRIBE scans;
DESCRIBE detection_results;
DESCRIBE refresh_tokens;
```

---

## 4. AI detection configuration

The backend uses an **OpenAI-compatible chat completions API**. A documented option with vision support is Z.ai (GLM), but any compatible provider works.

```env
AI_API_URL=https://api.z.ai/api/paas/v4
AI_API_KEY=your-real-key
AI_MODEL=glm-4v-plus
AI_TIMEOUT_MS=30000
```

- Create/sign in to the provider, create an API key, and confirm the current model name supports **vision** for image scans.
- Keep the key in `.env` only. It is used server-side and never sent to the browser.
- If `AI_API_KEY` is empty:
  - **Link/message:** deterministic checks run. The response and database set `detectionSource: "heuristic-fallback"` and `verified: false`, and the explanation says AI was unavailable.
  - **Image:** the server reads visible text locally with Tesseract OCR (English), then checks that text with the same deterministic message rules. The result is saved as `detectionSource: "ocr-fallback"`, `verified: false`, and the explanation states that no vision AI ran. OCR cannot detect forged layouts, logos or QR codes. If OCR itself cannot run, the API returns `503` and no verdict is invented.
  - The first OCR scan downloads the ~5 MB English language file into `backend/.cache/tesseract/` (git-ignored). Later scans are faster.

### Optional blacklist check

```env
SAFE_BROWSING_API_KEY=your-google-safe-browsing-v4-key
```

When set, the backend asks Google Safe Browsing about the submitted URL. When absent, the response says the blacklist check was unavailable; it never claims "no threats found".

### Email (password reset / email change)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-google-app-password
MAIL_FROM=ScamShield AI <you@gmail.com>
```

Gmail requires an **App Password**, not your normal account password. Without SMTP, `forgot-password` and email changes return a clear `503 EMAIL_NOT_CONFIGURED`.

> The frontend has no reset-password or verify-email page. The emails link to `/reset-password?token=...` and `/verify-email?token=...`. The APIs work; those two small pages would be the next frontend step.

---

## 5. Run the frontend

```powershell
cd frontend\frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

`frontend/frontend/.env.local`:

```env
VITE_API_URL=http://localhost:5000/api
```

Open <http://localhost:5173>. The website opens immediately in guest mode with an empty Dashboard. Click **Create account** / **Sign in** in the top bar, or try a scan/history action to open the sign-in modal. After signing in, the Dashboard loads that account's real data. If the backend is not running, the sign-in modal shows a clear "Cannot reach the backend" message instead of staying blank.

CORS: `FRONTEND_URL` in the backend `.env` must match the browser origin exactly (no trailing slash). Multiple origins can be comma-separated:

```env
FRONTEND_URL=http://localhost:5173,http://127.0.0.1:5173
```

---

## 6. API reference

Base URL: `http://localhost:5000/api`

Private routes require:

```http
Authorization: Bearer <accessToken>
```

### Response envelopes

Success:

```json
{
  "success": true,
  "message": "Scan completed successfully.",
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Validation failed. Please check the highlighted fields.",
  "errors": [{ "field": "email", "message": "Enter a valid email address." }],
  "code": "VALIDATION_ERROR"
}
```

### Authentication

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | No | Create account, set refresh cookie |
| POST | `/auth/login` | No | Sign in, set refresh cookie |
| POST | `/auth/refresh` | Cookie | Rotate refresh token, return new access token |
| POST | `/auth/logout` | Cookie | Revoke current refresh token + clear cookie |
| POST | `/auth/forgot-password` | No | Email a 1-hour reset link |
| POST | `/auth/reset-password` | No | Set a new password with a reset token |
| POST | `/auth/verify-email` | No | Confirm a pending new email address |
| GET | `/auth/me` | Yes | Current safe user object |

Register request:

```json
{
  "name": "Demo User",
  "email": "demo@example.com",
  "password": "Password123"
}
```

Response `201`:

```json
{
  "success": true,
  "message": "Account created successfully.",
  "data": {
    "user": {
      "id": 1,
      "name": "Demo User",
      "email": "demo@example.com",
      "profileImage": null,
      "createdAt": "...",
      "updatedAt": "..."
    },
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "accessTokenExpiresIn": "15m"
  }
}
```

The refresh token is **not** in the body. It is an HTTP-only cookie scoped to `/api/auth`.

### Dashboard

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/dashboard/stats` | Yes | Per-user totals |
| GET | `/dashboard/recent-scans?limit=5` | Yes | Latest scans (max 10) |

`stats.data` example:

```json
{
  "totalScans": 12,
  "safeItems": 5,
  "suspiciousItems": 4,
  "needsReviewItems": 1,
  "unverifiedItems": 2,
  "filesUploaded": 3,
  "pendingScans": 0,
  "failedScans": 0,
  "completedScans": 12,
  "typeStatistics": { "image": 3, "link": 4, "message": 5 },
  "riskBreakdown": { "Low": 5, "Medium": 1, "High": 3, "Critical": 1 },
  "lastScanAt": "..."
}
```

"Safe" only counts low-risk results that came from a real check (AI or threat intelligence). A low-scoring heuristic fallback is reported as `unverifiedItems`.

### Scans

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/scans/image` | Yes | `multipart/form-data`, field `image` (JPG/PNG, 10 MB) |
| POST | `/scans/link` | Yes | `{ "url": "https://..." }` |
| POST | `/scans/message` | Yes | `{ "message": "..." }`, max 5000 chars |
| GET | `/scans/:id` | Yes | One scan + verdict |
| GET | `/scans/image/:id` | Yes | Type-checked alias |
| GET | `/scans/link/:id` | Yes | Type-checked alias |
| GET | `/scans/message/:id` | Yes | Type-checked alias |
| GET | `/scans/:id/file` | Yes | Owner-only image download |

Scan response:

```json
{
  "success": true,
  "message": "Message scan completed successfully.",
  "data": {
    "scan": {
      "id": 4,
      "scanType": "message",
      "typeLabel": "Message",
      "inputValue": "...",
      "displayName": "...",
      "fileUrl": null,
      "status": "completed",
      "statusLabel": "Suspicious",
      "result": {
        "id": 4,
        "riskScore": 100,
        "riskLevel": "Critical",
        "isScam": true,
        "explanation": "Deterministic analysis found: ... AI analysis was unavailable ...",
        "recommendation": "...",
        "detectionSource": "heuristic-fallback",
        "verified": false,
        "createdAt": "..."
      },
      "createdAt": "...",
      "updatedAt": "..."
    },
    "result": { "...same result object..." }
  }
}
```

Risk bands:

| Score | Level | `isScam` |
|---|---|---|
| 0–29 | Low | `false` |
| 30–59 | Medium | `false` (needs review) |
| 60–79 | High | `true` |
| 80–100 | Critical | `true` |

### History

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/history` | Yes | Paginated, filterable list |
| GET | `/history/:id` | Yes | Owner-only scan |
| DELETE | `/history/:id` | Yes | Delete one scan + its file |
| DELETE | `/history` | Yes | Delete all of the user's scans |

Query parameters:

| Param | Values | Default |
|---|---|---|
| `page` | 1+ | `1` |
| `limit` | 1–100 | `10` |
| `type` | `image`, `link`, `message` | all |
| `riskLevel` | `Low`, `Medium`, `High`, `Critical` | all |
| `status` | `pending`, `completed`, `failed` | all |
| `search` | text, max 100 | none |
| `sort` | `newest`, `oldest` | `newest` |

Pagination is returned in `meta.pagination`.

### Settings

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/settings/profile` | Yes | Safe profile |
| PUT | `/settings/profile` | Yes | Update name / profile image / request email change |
| PUT | `/settings/change-password` | Yes | Verify current password, revoke sessions |
| DELETE | `/settings/account` | Yes | Verify password, cascade-delete account |

Update name:

```json
{ "name": "New Name" }
```

Request an email change (requires current password; sends a verification link to the new address):

```json
{
  "email": "new@example.com",
  "currentPassword": "Password123"
}
```

Change password:

```json
{
  "currentPassword": "Password123",
  "newPassword": "NewPassword123"
}
```

Delete account (irreversible; cascades scans/results/tokens/files):

```json
{ "password": "NewPassword123" }
```

---

## 7. Security decisions

- **Passwords:** bcrypt with a configurable work factor (default 12); never returned by any serialiser.
- **Access JWT:** 15 minutes, in the `Authorization` header only.
- **Refresh JWT:** 7 days, HTTP-only cookie (`SameSite=Lax` in development, `None` + `Secure` in production), SHA-256 hash stored in MySQL.
- **Rotation + reuse detection:** refreshing revokes the old row atomically. Reusing a revoked token revokes every session for that user.
- **Login/registration/reset/scan rate limits:** memory store, per IP.
- **SQL injection:** all database access goes through Sequelize parameter binding.
- **Mass assignment:** controllers read only named fields.
- **Uploads:** Multer memory storage; magic-byte validation; randomized filenames; `sharp` re-encoding strips EXIF; 40 MP decompression guard; private owner-only download route; no static `/uploads` mapping.
- **SSRF:** submitted URLs are **never fetched**. Localhost/private/link-local/numeric IPs are rejected. The only outbound URL check is a fixed Google Safe Browsing endpoint.
- **CORS:** explicit allow-list with credentials; dev-only localhost convenience.
- **Headers:** Helmet, `X-Powered-By` disabled, request IDs.
- **Errors:** centralized, safe messages; stack/internal details only in development logs.
- **Ownership:** every scan/history/file query includes `userId`; another user's ID returns 404.
- **Email tokens:** random 32-byte values, SHA-256 stored, one-hour expiry, single use.
- **Logging:** no passwords, tokens, message bodies, URLs or API keys are logged.

### Rate limits

| Scope | Limit |
|---|---|
| All `/api` routes | 300 / 15 min per IP |
| Login | 10 failures / 15 min |
| Register | 10 / hour |
| Forgot/reset password | 5 / hour |
| Session refresh | 60 / 15 min |
| Scans | 30 / 15 min |

---

## 8. Postman testing

1. Open Postman → **Import** → select both files in `backend/postman/`.
2. Select the **ScamShield AI Local** environment.
3. Start the backend (`npm run dev`).
4. Run **Auth → Register** first. It stores `accessToken` and `email` as collection variables.
5. Run the rest in order. Postman keeps the refresh cookie in its cookie jar.
6. For **Scans → Scan Image**, select `backend/postman/sample-image.png` if Postman asks for the file.

The collection covers:

- registration, duplicate/invalid registration, login, me, refresh, logout, forgot-password
- dashboard stats and recent scans
- message, link, image scans
- localhost/FTP rejection, empty message, invalid image
- history pagination, type/risk filters, search, get, delete one, delete all
- settings profile, name update, password change, account deletion
- unauthorized access, unknown route

Expected status codes are asserted in each request's **Tests** tab.

---

## 9. Automated tests

```powershell
cd backend
npm test
```

This runs:

- **Unit tests:** risk bands, score blending, URL/SSRF rules, phishing indicators, message evidence rules, negation handling.
- **Integration tests:** start an ephemeral **real MySQL 8.4** instance via `mysql-memory-server`, run the actual migrations, and exercise all APIs with `supertest` — including cookie refresh rotation, reuse detection, account isolation, image validation, the local OCR fallback, a mocked vision-AI scan, and account deletion.

The first integration run downloads a MySQL binary; later runs are fast. It does not need your system MySQL and does not touch `scam_shield_ai`.

Run only the fast unit tests:

```powershell
node --test tests/risk.test.js tests/urlDetection.test.js tests/messageDetection.test.js
```

---

## 10. Deployment checklist

1. **HTTPS is mandatory.** Production refresh cookies are `Secure` + `SameSite=None` for cross-site frontends.
2. Set `NODE_ENV=production`.
3. Set `TRUST_PROXY=true` only behind a trusted reverse proxy (nginx, Caddy, Render, Railway, etc.).
4. Set `FRONTEND_URL` to the exact production origin(s).
5. Generate fresh long JWT secrets; never reuse development ones.
6. Use a least-privilege MySQL user; do not use `root` in production.
7. Set `DB_LOGGING=false`; centralize logs with your host.
8. Configure `SMTP_*`, `AI_API_*` and optionally `SAFE_BROWSING_API_KEY`.
9. Run `npm run db:migrate` as a release step; do not use `sequelize.sync()`.
10. Keep `uploads/` on a persistent disk with backups. If the platform uses an ephemeral filesystem, replace the local storage calls with S3/Cloudinary and keep the owner-only download route.
11. Build the frontend (`npm run build`) and serve `dist/` over HTTPS.
12. Never commit `.env`, `uploads/`, or real API keys. `.gitignore` already covers them.

Process manager examples:

```powershell
npm install -g pm2
pm2 start server.js --name scamshield-api
pm2 save
```

---

## 11. Troubleshooting

| Error | Fix |
|---|---|
| `ER_BAD_DB_ERROR` | Run `npm run db:create`, or create the database in MySQL Workbench. |
| `ER_ACCESS_DENIED_ERROR` | Check `DB_USER` / `DB_PASSWORD`; grant privileges to the database. |
| `ECONNREFUSED 127.0.0.1:3306` | Start MySQL (`Start-Service MySQL80` or XAMPP). |
| `Port 5000 is already in use` | Stop the other server or change `PORT` in `.env`. |
| Backend says `http://localhost:0` or frontend says it cannot reach the API | Set `PORT=5000` in `backend/.env`. An exported `PORT=0` in the terminal is ignored in favour of the valid `.env` value; restart the backend. |
| No sign-in modal / blank screen | Start the backend first. The frontend needs `http://localhost:5000/api`; signing in shows the connection error when the API is down. |
| CORS error in browser | `FRONTEND_URL` must match the browser origin exactly. |
| Login works but refresh fails | The frontend must use `withCredentials: true` (already configured) and the cookie path is `/api/auth`. |
| `AI_NOT_CONFIGURED` | Set `AI_API_KEY` if you want AI analysis. Link/message scans still work with the labelled heuristic fallback. |
| `EMAIL_NOT_CONFIGURED` | Set the `SMTP_*` variables. |
| Image scan 503 | Both the vision AI and local OCR failed. Check the server log and that `backend/.cache/tesseract/` is writable / the language file can download. |
| Image result says "not AI-verified" | Expected when `AI_API_KEY` is empty: the visible text was read with local OCR, not a vision model. |
| Integration tests time out | First run downloads MySQL; allow time/network. System MySQL is not required. |

---

## 12. Known scope boundaries

- The **Settings page UI** is still the original placeholder; the frontend source contains no form fields to connect. All profile/password/delete APIs are ready.
- The **Scan File component** (PDF/TXT) exists in the frontend but was not part of the requested image/link/message backend. Dashboard uploads accept images; PDF/TXT selections receive a clear "not analyzed" message.
- **Password reset / email verification pages** do not exist in the frontend. The backend emails links to `/reset-password` and `/verify-email`; add those two pages to complete the browser flow.
- Image analysis uses a vision model when configured; otherwise it uses local OCR and is always marked unverified. OCR cannot inspect visual layout, logos or QR codes, so it is not equivalent to a vision model.
- Safe Browsing is optional and only used when a key is configured.
