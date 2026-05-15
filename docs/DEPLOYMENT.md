# Deployment Guide

## Production URL

**External:** `https://eldev.cherrysofa.com`
**Local:** `http://localhost:8080`

The domain is routed through a reverse proxy (nginx/OpenResty) which handles SSL. The app itself only needs to run on port 8080.

---

## Switching Between Dev and Production

The `brandpack.sh` script handles switching, status checks, and log viewing:

```bash
./brandpack.sh status              # Show what's currently running
./brandpack.sh switch dev prod     # Stop dev, start production
./brandpack.sh switch prod dev     # Stop production, start dev
./brandpack.sh start prod          # Start production only
./brandpack.sh stop prod           # Stop production only
./brandpack.sh tail prod           # Follow production logs
./brandpack.sh tail dev            # Follow dev logs
```

Or use systemd directly — see `docs/SERVER-COMMANDS.md`.

---

## Deploying Frontend Changes

Production serves the pre-built client from `client/dist/`. After any frontend change:

```bash
npm run build
sudo systemctl restart work-tools
```

---

## Updating the Application

```bash
git pull
npm run install:all     # only if package.json changed
npm run build           # rebuild frontend
sudo systemctl restart work-tools
```

---

## Production Environment

**`server/.env`** must have:
```env
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DATABASE_PATH=./data/brandpack.db
SESSION_SECRET=<strong-random-value>   # generate: openssl rand -base64 32
SESSION_MAX_AGE=86400000
```

Production vs dev differences:

| | Dev | Production |
|---|---|---|
| Frontend | Vite (port 5173, HMR) | Express static from `client/dist/` |
| Logging | debug | info |
| Session cookies | Secure=false | Secure=true (requires HTTPS) |
| NODE_ENV | development | production |

---

## Health Check

```bash
curl http://localhost:8080/api/health
# Expected: {"status":"ok","environment":"production",...}
```

---

## Troubleshooting

**Service won't start:**
```bash
sudo journalctl -u work-tools -n 50
sudo lsof -i :8080          # check if port is in use
ls -l server/data/brandpack.db   # check db file exists
```

**Static files not loading (404s):**
```bash
ls client/dist/             # verify build exists
npm run build && sudo systemctl restart work-tools
```

**Sessions not persisting:**
```bash
grep SESSION_SECRET server/.env        # must be set
# Sessions require HTTPS in production (secure cookies)
```

**Can access localhost but not domain:**
The reverse proxy (nginx/OpenResty) config lives outside this codebase. Check DNS, firewall, and SSL certificate separately.

---

## Database Backup & Restore

```bash
cd server
npm run backup    # creates server/backups/backup-YYYY-MM-DD-HHMMSS.db
npm run restore   # interactive restore from backup
```

**Emergency rollback:**
```bash
sudo systemctl stop work-tools
cd server && npm run restore -- backups/backup-YYYY-MM-DD-HHMMSS.db
sudo systemctl start work-tools
```
