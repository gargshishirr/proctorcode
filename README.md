# 🛡️ ProctorCode

An **AI-proctored coding test platform**. Candidates take timed coding tests in a monitored
browser window. Admins create tests, invite candidates and review integrity reports.

📘 **New here? Read the short [GUIDE.md](GUIDE.md)** — how to use it, deploy it and keep it safe.

## 🔗 Live demo

**https://proctorcode.onrender.com**

There are no shared passwords. On the sign-in page, use the demo buttons:

- **Try as candidate** — makes a throwaway candidate account just for you. Take a test with your webcam.
- **Try as admin (read-only)** — look at every demo session and report. Changes are turned off.

> - Demo data is shared and resets every few hours. Don't enter real personal data.
> - Hosted on Render's free plan: the first visit can take 30–60 s while it wakes up.

---

## ✨ Features

### Proctoring
- **Webcam face & gaze checks** (face-api.js) — flags *looking away*, *no face* and *multiple faces*.
  Runs in the browser; **no video or images are uploaded**.
- **Tab / window switch**, **fullscreen exit**, **copy / cut / paste**, **dev-tools / print / right-click** detection.
- **Live integrity score** — each flag lowers it; at 0 the server ends the attempt.
- Clear consent screen that says what is checked and what is stored.

### Platform
- Admin: test editor (Markdown + starter code), sessions list, full reports, invite links, candidate removal.
- Candidate: Monaco code editor, countdown timer (enforced by the server), autosave, a sandboxed
  JavaScript runner, and a results page.
- **Invite-only sign-up** by default (open sign-up is an opt-in switch).
- **Public demo mode** (`DEMO_MODE=true`) with "Try" buttons and a read-only demo admin.

### Security
- No default or public accounts. The admin comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- Production refuses to start with a weak admin password or a short `JWT_SECRET`.
- HttpOnly + Secure + SameSite=Strict session cookie (no tokens in `localStorage`).
- JWT pinned to HS256 with issuer/audience checks, plus server-side sessions, so logout and
  password changes revoke old tokens.
- bcrypt (cost 12), sign-in lockout without account enumeration, rate limits.
- Same-origin checks against CSRF, strict security headers and CSP, no CORS.
- Server-side role checks, owner-only attempts (no IDOR), attempts locked after submission.

---

## 🧱 Tech stack

| Layer    | Tech                                                                  |
|----------|-----------------------------------------------------------------------|
| Frontend | React + Vite, React Router, Monaco Editor (self-hosted), face-api.js  |
| Backend  | Node.js + Express 5, helmet, express-rate-limit, JWT, bcryptjs        |
| Database | SQLite via Node's built-in `node:sqlite` (no native build)            |

---

## 📁 Structure

```
proctorcode/
├── GUIDE.md                  # short how-to: use, deploy, maintain
├── render.yaml               # free public demo on Render
├── render.production.yaml    # paid plan + persistent disk
├── backend/
│   ├── src/
│   │   ├── server.js         # startup checks, admin bootstrap, demo reset, listen
│   │   ├── app.js            # Express app, headers, static files
│   │   ├── config.js         # env settings + production safety checks
│   │   ├── db.js             # node:sqlite schema + upgrades
│   │   ├── security.js       # CSP/headers, CSRF origin check, rate limits, lockout
│   │   ├── middleware/auth.js# sessions, cookies, role guards
│   │   ├── seedData.js       # admin from env, demo data, dev seed
│   │   └── routes/           # auth, tests, attempts, admin, demo
│   └── test/                 # node:test API tests
└── frontend/
    ├── public/models/        # face-api model weights
    └── src/
        ├── pages/            # Login, Register, Admin*, User*, TakeTest, Account
        ├── components/       # Navbar, WebcamProctor, DemoButtons, Modal…
        └── hooks/useProctoring.js
```

---

## 🚀 Run locally

Needs **Node.js 22.13+** (Node 24 recommended).

```bash
npm run setup     # install backend + frontend
npm run seed      # sample tests + dev admin/candidate; prints freshly generated passwords
npm run backend   # API on http://localhost:4000
npm run frontend  # app on http://localhost:5173 (second terminal)
```

- `npm run seed` is for local development only. It refuses to run with `NODE_ENV=production`.
- Optional settings live in `backend/.env` (copy `backend/.env.example`).
- Production build locally: `npm run build` then `npm start` (everything on port 4000).
- Checks: `npm test` (API tests) and `npm run build` (frontend). CI runs both on Node 22 and 24.

---

## ⚙️ Configuration

| Variable | What it does |
|----------|--------------|
| `JWT_SECRET` | Signs session tokens. 32+ random characters. Required in production. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The owner's admin account (created or updated on start). Password 12+ chars. |
| `DEMO_MODE` | `true` = public demo: "Try" buttons, read-only demo admin, no sign-up, periodic reset. |
| `DEMO_RESET_HOURS` | How often demo data resets (default 6). |
| `DATA_DIR` / `DB_PATH` | Where the SQLite file lives (default `backend/data/app.db`). |
| `PORT` | HTTP port (default 4000). |
| `TRUST_PROXY` | Proxy hops to trust (automatic on Render). |

---

## ☁️ Deploy to Render

- **Free demo:** `render.yaml`. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` when Render asks.
  The free disk is temporary, so **all data is lost on restart or deploy**.
- **Real use:** `render.production.yaml` (paid plan + disk at `/var/data`). Data is kept.

Step-by-step instructions are in [GUIDE.md](GUIDE.md#deploy-on-render).

---

## 🔌 API overview

| Method | Endpoint | Who | Purpose |
|--------|----------|-----|---------|
| GET | `/api/config` | anyone | Demo mode and sign-up mode |
| POST | `/api/auth/register` `/login` `/logout` `/logout-all` | — | Sessions (cookie) |
| GET | `/api/auth/session` `/me` | — / signed in | Current user |
| POST | `/api/auth/password` | signed in | Change password |
| POST | `/api/demo/candidate` `/admin` | demo only | Start a demo session |
| GET | `/api/tests` | both | List tests (candidates: active only) |
| POST/PUT/DELETE | `/api/tests[/:id]` | admin | Manage tests |
| POST | `/api/attempts` | candidate | Start / resume an attempt |
| GET | `/api/attempts/mine` `/:id` | candidate | Own attempts only |
| PUT | `/api/attempts/:id/code` | candidate | Autosave |
| POST | `/api/attempts/:id/violations` `/submit` | candidate | Flags / submit |
| GET | `/api/admin/stats` `/attempts[/:id]` `/users` | admin | Dashboard and reports |
| DELETE | `/api/admin/attempts/:id` `/users/:id` | admin | Remove a session / candidate |
| GET/POST/DELETE | `/api/admin/invites[/:id]` | admin | Invite links |
| GET/PUT | `/api/admin/settings` | admin | Open sign-up on/off |

---

## 📝 Notes & limitations

- **Run button:** JavaScript/TypeScript only. It runs in the candidate's own browser in a Web Worker
  (no page, cookie or DOM access; 3 s limit). The server never executes candidate code.
- **Proctoring is a deterrent, not proof.** Checks run in the candidate's browser, so a skilled
  person can bypass them. Use the report as one signal and talk to the candidate.
- Thresholds live in `frontend/src/components/WebcamProctor.jsx` and `frontend/src/hooks/useProctoring.js`.
