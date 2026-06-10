# 🛡️ ProctorCode

An **AI-proctored coding assessment platform**. Candidates take timed coding tests
in a locked-down, monitored environment while administrators author tests and review
detailed integrity reports.

## 🔗 Live demo

**https://proctorcode.onrender.com**

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@proctorcode.dev` | `admin123` |
| Candidate | `candidate@proctorcode.dev` | `test123` |

> Hosted on Render's free tier — the first request may take ~30–60s while the instance
> wakes up. Allow the camera prompt on the exam screen for AI gaze tracking.

Two roles, two experiences:

- **Administrator** — create/manage tests, view every session and its integrity report.
- **Test taker (candidate)** — take proctored coding tests and view personal results.

---

## ✨ Features

### AI / proctoring
- **Webcam gaze & face tracking** (face-api.js) — flags *looking away*, *no face*, and *multiple faces*.
- **Tab-switch detection** (Page Visibility API).
- **Window / monitor switch detection** (window blur).
- **Clipboard guard** — copy, cut and paste are detected and scored.
- **Fullscreen enforcement** — leaving fullscreen is flagged.
- **Dev-tools / print / right-click** attempts are blocked & recorded.
- **Live integrity score** — every violation lowers the score in real time; a session that
  hits 0 is automatically terminated.

### Platform
- JWT authentication with `admin` / `user` roles.
- Admin dashboard with stats, test CRUD, and full session reports (violation timeline + submitted code).
- Candidate dashboard with a consent step, in-browser **Monaco** code editor, countdown timer,
  autosave, and an optional JavaScript runner (sandboxed Web Worker).
- Clean, responsive UI.

---

## 🧱 Tech stack

| Layer     | Tech                                                            |
|-----------|----------------------------------------------------------------|
| Frontend  | React + Vite, React Router, Monaco Editor, face-api.js, axios  |
| Backend   | Node.js + Express, JWT, bcryptjs                               |
| Database  | SQLite via Node's built-in `node:sqlite` (no native build)     |

---

## 📁 Structure

```
coding-test-platform/
├── backend/
│   ├── src/
│   │   ├── server.js          # Express app
│   │   ├── db.js              # node:sqlite schema
│   │   ├── seed.js            # demo admin + candidate + sample tests
│   │   ├── config.js          # .env loader
│   │   ├── middleware/auth.js # JWT + role guards
│   │   └── routes/            # auth, tests, attempts, admin
│   └── data/app.db            # created at runtime
└── frontend/
    ├── public/models/         # face-api model weights
    └── src/
        ├── pages/             # Login, Register, Admin*, User*, TakeTest…
        ├── components/        # Navbar, WebcamProctor, Modal, Icon…
        ├── hooks/useProctoring.js   # behavioural proctoring engine
        └── context/           # Auth + Toast providers
```

---

## 🚀 Getting started

### Prerequisites
- **Node.js 22.5+** (uses the built-in `node:sqlite` module; Node 24 recommended).

### 1. Install
```bash
cd coding-test-platform
npm run setup          # installs backend + frontend deps
```

### 2. Seed the database
```bash
npm run seed
```

### 3. Run (two terminals)
```bash
# terminal 1 — API on http://localhost:4000
npm run backend

# terminal 2 — app on http://localhost:5173
npm run frontend
```

Open **http://localhost:5173**.

> The frontend dev server proxies `/api` to the backend, so no CORS setup is needed.

### Demo accounts
| Role       | Email                       | Password   |
|------------|-----------------------------|------------|
| Admin      | `admin@proctorcode.dev`     | `admin123` |
| Candidate  | `candidate@proctorcode.dev` | `test123`  |

You can also self-register from the login screen (choose *Test taker* or *Administrator*).

---

## 🎥 Using the proctored test

1. Sign in as a candidate and click **Start test** → review the consent dialog.
2. Click **Begin test in fullscreen** — this grants camera access and enters fullscreen
   (both require a user click, so they happen here).
3. Solve the problem in the editor. The right-hand **AI Proctor** panel shows the live
   webcam feed and status; the **Activity monitor** lists violations as they happen.
4. Submit when done — you're taken to your result with the final integrity score.

> **Camera & HTTPS note:** browsers allow `getUserMedia` on `http://localhost`. If you host
> this elsewhere, serve it over **HTTPS** or the webcam proctor will be blocked (it degrades
> gracefully and logs a `camera_blocked` flag).

---

## 🔌 API overview

| Method | Endpoint                          | Role  | Purpose                          |
|--------|-----------------------------------|-------|----------------------------------|
| POST   | `/api/auth/register` `/login`     | —     | Auth                             |
| GET    | `/api/tests`                      | both  | List tests (admin: all)          |
| POST/PUT/DELETE | `/api/tests[/:id]`       | admin | Manage tests                     |
| POST   | `/api/attempts`                   | user  | Start / resume an attempt        |
| PUT    | `/api/attempts/:id/code`          | user  | Autosave code                    |
| POST   | `/api/attempts/:id/violations`    | user  | Log a proctoring violation       |
| POST   | `/api/attempts/:id/submit`        | user  | Submit / terminate               |
| GET    | `/api/admin/stats` `/attempts`    | admin | Dashboard + integrity reports    |

---

## ⚙️ Configuration

Backend reads `backend/.env` (copied from `.env.example`):

```
PORT=4000
JWT_SECRET=change-this-secret-in-production-please
CLIENT_ORIGIN=http://localhost:5173
```

---

## ☁️ Deploy to Render (single service)

This repo includes a `render.yaml` blueprint. One Node service builds the React app and
serves it together with the API (so the webcam proctor gets HTTPS automatically).

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, connect the repo, and apply. Render reads `render.yaml`:
   - **Build:** installs both workspaces and runs `vite build`.
   - **Start:** `npm start --prefix backend` (Express serves `frontend/dist` + the API).
   - `JWT_SECRET` is auto-generated; `NODE_VERSION` is pinned to 24 (required for `node:sqlite`).
3. Open the resulting `https://<your-service>.onrender.com` URL.

> Demo data (admin + candidate + sample tests) is **auto-seeded on first boot**.
> The free plan uses an ephemeral disk, so data resets on redeploy — fine for a demo.
> For persistent data, attach a Render Disk mounted at `backend/data`.

To run the production build locally:
```bash
npm run build      # build the React app
npm start          # Express serves the build + API on http://localhost:4000
```

## 📝 Notes & limitations
- The optional **Run** button executes only JavaScript/TypeScript in a sandboxed Web Worker
  (3s timeout). Other languages are graded from the submitted source.
- Proctoring heuristics are intentionally tuned to be informative rather than punitive;
  thresholds live in `frontend/src/components/WebcamProctor.jsx` and
  `frontend/src/hooks/useProctoring.js`.
- For production: set a strong `JWT_SECRET`, serve over HTTPS, and tighten CORS in `server.js`.
