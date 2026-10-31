# ScamShield AI — Frontend

React 19 + Vite frontend for the ScamShield AI backend. The original Dashboard,
Scan Image, Scan Link, Scan Message, History and Sidebar design is preserved;
the screens now use the real API instead of demo data.

## Run it

The backend must be running first on `http://localhost:5000`.

**Terminal 1 — backend:**

```powershell
cd backend
npm install
npm run dev:demo
```

`npm run dev:demo` starts a temporary real MySQL database, so you do not need a
MySQL password for a quick demo. For persistent data, configure `backend/.env`
and use `npm run dev` there instead.

**Terminal 2 — frontend:**

```powershell
cd frontend\frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The website opens immediately in **guest mode**: you
can browse the Dashboard and every scan page. Click **Sign in** / **Create
account** in the top bar, or try to scan / open History, and the sign-in modal
appears. After signing in, the Dashboard loads that account's real scans.

## API URL

The default is `http://localhost:5000/api`. To change it, create
`.env.local` from `.env.example`:

```env
VITE_API_URL=http://localhost:5000/api
```

Restart Vite after changing it. If the frontend cannot reach the backend, the
sign-in screen shows the exact URL it tried instead of staying blank.

## What is connected

| Page | API |
|---|---|
| Dashboard stats | `GET /api/dashboard/stats` |
| Recent scans / alerts | `GET /api/dashboard/recent-scans` |
| Quick Scan message/link | `POST /api/scans/message`, `POST /api/scans/link` |
| Scan Image | `POST /api/scans/image` |
| Scan Link | `POST /api/scans/link` |
| Scan Message | `POST /api/scans/message` |
| Scan History | `GET /api/history`, `DELETE /api/history/:id` |
| Sign in / register modal | `POST /api/auth/login`, `POST /api/auth/register` |
| Guest browsing | Dashboard and scan pages are visible before login; scanning/history requires an account |

Guest visitors get empty, real zero counts. Once signed in, access tokens are
kept in memory and the refresh token is an HTTP-only cookie, so a page reload
restores the session through `POST /api/auth/refresh`. Signing out clears the
previous account's counts from the screen.

Image scans use the backend's vision AI when `AI_API_KEY` is set. Without a key,
the backend reads visible text with local OCR and labels the result
**not AI-verified**; it never changes the image into a fake "safe" result.

## Build

```powershell
npm run lint
npm run build
npm run preview
```

The production build is written to `dist/`.

## Notes

- The Settings nav still opens the original placeholder because the provided
  frontend has no settings form. The profile/password/delete APIs exist in the
  backend.
- PDF/TXT uploads are outside the image/link/message scan scope and are shown as
  not analyzed.
- Analytics (PostHog) is opt-in. Nothing is sent unless the visitor chooses
  **Allow** and `VITE_POSTHOG_KEY` is configured.
