# How WorkBase Works

A plain-language overview of the system — how it's built, how it runs, and how the pieces connect.

---

## What Is It?

WorkBase is an internal web application that runs on a computer on the local network. Staff access it through a browser, just like a normal website, but it never goes to the internet — everything lives on that one machine. It's a collection of tools for the proofing room: inventory tracking, productivity logging, Pantone colour lookup, maintenance logging, and more.

---

## The Two Halves

The app is split into two parts that run at the same time:

### 1. The Server (the "back end")

This is a program running quietly in the background on the host machine. It does three things:

- **Stores all the data** in a database file on disk (`brandpack.db`). This is where all inventory records, productivity entries, user accounts, etc. live permanently.
- **Handles logins and security.** When you log in, the server checks your username and PIN, and keeps track of who is currently signed in.
- **Answers requests from the browser.** When a page needs to load some data (e.g. "show me all inventory items"), it asks the server, and the server fetches it from the database and sends it back.

The server runs on **port 8080** and is always-on in production via a system service (`work-tools.service`).

### 2. The Client (the "front end")

This is everything you see in the browser — the pages, buttons, tables, forms. It's built from HTML, CSS, and JavaScript files that are served by the server itself.

When you open the app, the browser downloads those files and runs them locally. The pages then communicate with the server behind the scenes to load and save data.

---

## How a Page Loads (Step by Step)

1. You open a browser and go to the server's address (e.g. `http://192.168.x.x:8080`).
2. The server redirects you to the **Launcher** (the main dashboard).
3. The page checks if you're logged in. If not, it sends you to the **Login page**.
4. You enter your username and PIN. This is sent to the server, which checks it against the database. If correct, a **session** is created — a small token stored in a cookie that proves you're logged in.
5. You're redirected to the Launcher. From here you pick a tool.
6. Every tool page loads, checks your session is still valid, then fetches whatever data it needs from the server and displays it.

---

## The Database

All data is stored in a single **SQLite** database file — a self-contained file on disk, not a separate database server. It holds every table: users, inventory items, productivity records, Pantone colours, maintenance visits, sessions, etc.

SQLite is simple and reliable for a single-machine app like this. There's no separate database process to manage — the server just reads and writes the file directly.

Backups can be made manually by running a script (`node scripts/backup-database.js` from the `server/` directory) which copies the database to a timestamped file.

---

## Logging In — How It Actually Works

Passwords (PINs) are **never stored as plain text**. When a user is created, the PIN is run through a one-way hashing algorithm (bcrypt) and only the scrambled result is stored. When you log in, the same process is applied to what you type and compared — the original PIN can never be recovered from what's in the database.

Once logged in, the server creates a **session** — a record in the database that says "this browser is logged in as this user." The browser holds a cookie with a session ID. Every request the browser makes includes that cookie, and the server checks it against the session database to confirm who you are.

Sessions are automatically cleared at the end of a shift (handled by the shift scheduler) and expire after 24 hours.

---

## The Tools

Each tool is a completely self-contained page. They share a common look (via shared CSS and the header component) but are otherwise independent. The tools are:

| Tool | Purpose |
|---|---|
| **Launcher** | Dashboard — links to all tools, shows stats and upcoming events |
| **Inventory** | Track stock levels, scan barcodes, manage items |
| **Productivity V4** | Log and track work tasks with time tracking |
| **Pantone** | Look up Pantone colour codes and collections |
| **Converter** | Unit/measurement conversion utilities |
| **Maintenance** | Log equipment issues and service visits |
| **Admin** | User management (admin-only) |

---

## How the Pages Stay Up to Date

Most tool pages **poll** the server on a timer — every few seconds or minutes they quietly ask "anything changed?" and update the display if so. There's no live push from the server; the page just asks regularly.

The intervals are deliberately kept short for active use (e.g. every 3 seconds for the productivity timer) but can be slowed down by enabling **Low Energy Mode**, which stretches those intervals out to reduce CPU and network activity.

---

## Development vs Production

The app runs in two modes:

**Production** — one process, the server, handles everything. It serves the pre-built frontend files and runs the API. Managed by systemd (`work-tools.service`), starts automatically on boot.

**Development** — two processes run together:
- The server (with **nodemon**, which auto-restarts when code changes)
- A **Vite** dev server, which serves the frontend with instant hot-reload when you save a file

In dev, the frontend runs on port **5173** and the backend on **8080**. Vite transparently forwards any `/api/...` request from the browser to the Express server, so you never have to think about the two ports separately.

---

## Technology Summary

| Layer | Technology | Why |
|---|---|---|
| Server runtime | Node.js | JavaScript on the server |
| Web framework | Express.js | Handles HTTP requests and routing |
| Database | SQLite | Simple, file-based, no setup required |
| Frontend | Vanilla JavaScript | No framework needed for this scale |
| Build tool | Vite | Bundles frontend for production, HMR in dev |
| Auth | express-session | Cookie-based sessions stored in SQLite |
| Process manager | systemd | Keeps the server running, restarts on crash |
| Dev process runner | concurrently | Runs server + Vite together with one command |

---

## File Layout (Simplified)

```
work-tools/
├── server/               ← Backend (Node.js / Express)
│   ├── src/
│   │   ├── server.js     ← Entry point, starts everything
│   │   ├── routes/       ← One file per tool (inventory, users, etc.)
│   │   ├── models/       ← All database queries live here
│   │   ├── middleware/   ← Auth checks, error handling
│   │   └── config/       ← Database connection, session setup
│   ├── data/
│   │   └── brandpack.db  ← The actual database file
│   └── migrations/
│       └── init.sql      ← Initial database schema (run once)
│
├── client/               ← Frontend (HTML / CSS / JS)
│   └── src/
│       ├── tools/        ← One folder per tool (each is a full page)
│       └── shared/       ← Shared components, styles, utilities
│
├── work-tools.service   ← systemd production service
└── brandpack-dev.service     ← systemd development service
```

---

## What Happens When Something Goes Wrong

- **Server crashes**: systemd detects it and automatically restarts it within 10 seconds.
- **A request fails**: the browser shows a toast notification with the error message. The server logs the full error including a stack trace.
- **Database locked or corrupted**: the server will fail to start and log the error. A backup can be restored using `node scripts/restore-database.js`.
- **Session expires**: the next request returns a 401 (unauthorised) response, the browser clears its session cache, and redirects to the login page.
