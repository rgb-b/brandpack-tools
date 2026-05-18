# Work Tools — Self-Hosting Guide

> Deploy your own instance on a Linux server with a custom domain via Cloudflare Tunnel.
> No open ports required. Works behind NAT, CasaOS, or any existing web server.

---

## Requirements

| Dependency | Version | Notes |
|---|---|---|
| Node.js | v20+ | v22 LTS recommended |
| npm | v9+ | comes with Node |
| Git | any | for cloning |
| cloudflared | latest | Cloudflare Tunnel client |
| Cloudflare account | free | domain must be on Cloudflare DNS |

> **Not required:** nginx, Apache, open firewall ports, SSL certificates (Cloudflare handles TLS).

---

## 1. Install Node.js

Use nvm to avoid permission issues:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22
node --version   # should print v22.x.x
```

---

## 2. Clone and Install

```bash
git clone https://github.com/rgb-b/work-tools.git
cd work-tools
npm run install:all
```

This installs dependencies for the root, server, and client in one step.

---

## 3. Configure Environment

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
NODE_ENV=production
PORT=8081            # choose any free port
HOST=0.0.0.0

DATABASE_PATH=./data/app.db

SESSION_SECRET=      # REQUIRED — generate with: openssl rand -base64 32
SESSION_MAX_AGE=86400000

LOG_LEVEL=info
```

> **Important:** `SESSION_SECRET` must be a long random string. The app will not start securely without it.
> Run `openssl rand -base64 32` to generate one.

---

## 4. Build the Client

```bash
npm run build
```

This compiles the Vite frontend into `client/dist/`, which Express serves in production.

---

## 5. Run as a systemd Service

This keeps the app running after reboot and restarts it on crash.

**Create the service file:**

```bash
sudo nano /etc/systemd/system/work-tools.service
```

```ini
[Unit]
Description=Work Tools Web Application
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/path/to/work-tools/server
EnvironmentFile=/path/to/work-tools/server/.env
Environment="NODE_ENV=production"
ExecStart=/path/to/.nvm/versions/node/v22.x.x/bin/node src/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=work-tools

[Install]
WantedBy=multi-user.target
```

> To find your node path: `which node` or `nvm which current`

**Enable and start:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now work-tools.service
sudo systemctl status work-tools.service
```

**Check logs:**

```bash
journalctl -u work-tools.service -f
```

---

## 6. Set Up Cloudflare Tunnel

Cloudflare Tunnel routes public HTTPS traffic to your local app without opening firewall ports.

### 6a. Install cloudflared

```bash
# Download (check https://github.com/cloudflare/cloudflared/releases for latest)
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### 6b. Log in to Cloudflare

```bash
cloudflared tunnel login
```

A browser window opens. Select the domain you want to use (e.g. `rgb-b.com`).
This saves a certificate to `~/.cloudflared/cert.pem`.

> If you have **multiple Cloudflare accounts** (e.g. one for each domain), log in to the correct account first.
> The cert saved by `tunnel login` is tied to the account — use `--origincert` to specify it explicitly
> when running DNS commands if you have multiple certs.

### 6c. Create a tunnel

```bash
cloudflared tunnel create work-tools
```

Note the tunnel UUID printed (e.g. `abc123-...`). You'll need it in the config.

### 6d. Create tunnel config

```bash
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: YOUR_TUNNEL_UUID
credentials-file: /home/YOUR_USERNAME/.cloudflared/YOUR_TUNNEL_UUID.json

ingress:
    - hostname: tools.rgb-b.com
      service: http://localhost:8081    # must match PORT in server/.env
    - service: http_status:404
```

> Add other hostnames above the 404 catchall if you have other services on the same machine.

### 6e. Create DNS record

```bash
cloudflared tunnel route dns work-tools tools.rgb-b.com
```

> If your cert is for a specific account/domain, add `--origincert ~/.cloudflared/cert.pem`

This creates a `CNAME` record in Cloudflare DNS pointing `tools.rgb-b.com` → your tunnel.

### 6f. Run tunnel as a service

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

> The cloudflared system service reads from `/etc/cloudflared/config.yml`.
> Copy your config there if needed: `sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml`

---

## 7. Verify the Deployment

```bash
# App is running locally
curl -s http://localhost:8081/api/health

# Domain resolves to Cloudflare
dig +short tools.rgb-b.com

# Full end-to-end (should return JSON with setup_complete: false on first run)
curl -s https://tools.rgb-b.com/api/v1/config
```

---

## 8. First-Time Setup

Visit `https://tools.rgb-b.com` in a browser.

You will be redirected to the setup wizard automatically. Follow the steps:

| Step | What to do |
|---|---|
| **1 — Name** | Enter your app name, tagline, and accent colour |
| **2 — Tools** | Enable the modules your team will use |
| **3 — Equipment** | Add machines/devices to track (optional — can skip) |
| **4 — Admin** | Create the first admin account with a PIN (4–8 digits, not sequential) |

On completion you're redirected to login. Use the username and PIN you just set.

> **PIN rules:** minimum 4 digits, maximum 8, digits only, cannot be all the same digit (e.g. `1111`) or sequential (e.g. `1234`).

---

## Backup and Restore

```bash
# Backup database and config
cp server/data/app.db server/data/backups/app_$(date +%Y%m%d).db
cp config.json backups/config_$(date +%Y%m%d).json

# Restore (stop service first)
sudo systemctl stop work-tools.service
cp server/data/backups/app_YYYYMMDD.db server/data/app.db
cp backups/config_YYYYMMDD.json config.json
sudo systemctl start work-tools.service
```

---

## Updating

```bash
cd work-tools
git pull
npm run install:all
npm run build
sudo systemctl restart work-tools.service
```

Migrations run automatically on startup — no manual steps needed for schema updates.

---

## Troubleshooting

| Problem | Check |
|---|---|
| App not starting | `journalctl -u work-tools.service -n 50` |
| Domain not resolving | `dig +short tools.yourdomain.com` — should return Cloudflare IPs |
| Tunnel not connecting | `journalctl -u cloudflared -n 50` |
| Setup wizard not loading | Visit `/src/tools/setup/index.html` directly |
| Forgot admin PIN | Stop service → delete `server/data/app.db` → restart → re-run setup |
| Port conflict | Change `PORT` in `server/.env` and update `config.yml` service line |
| `SESSION_SECRET` missing | App will log a warning and sessions will not persist across restarts |

---

## Directory Structure Reference

```
work-tools/
├── client/              # Vite frontend (vanilla JS)
│   └── dist/            # built output (generated by npm run build)
├── server/
│   ├── src/             # Express backend
│   ├── migrations/      # SQL migration files (auto-applied on startup)
│   ├── data/            # SQLite database lives here (gitignored)
│   └── .env             # environment config (gitignored — copy from .env.example)
├── config.json          # app config written by setup wizard (gitignored)
└── INSTALL.md           # this file
```
