# tools.rgb-b.com — Hosting Setup Guide

---

## What's Already Done

| Component | Status | Detail |
|---|---|---|
| Cloudflare Tunnel | ✅ Running | `cloudflared.service` active |
| Tunnel config | ✅ Set | `tools.rgb-b.com → http://localhost:8081` |
| App service | ✅ Running | `brandpack-tools.service` active on port 8081 |
| DNS record | ❌ Missing | Needs adding in Cloudflare dashboard |

---

## Step 1 — Add DNS Record (Only Step Required)

1. Log in to **dash.cloudflare.com**
2. Select the `rgb-b.com` zone
3. Go to **DNS → Records → Add record**

| Field | Value |
|---|---|
| Type | `CNAME` |
| Name | `tools` |
| Target | `298a0402-1fa7-4a89-b7d1-3f42995dc6cb.cfargotunnel.com` |
| Proxy status | **Proxied** (orange cloud) |
| TTL | Auto |

4. Save. Propagation is near-instant via Cloudflare.
5. Visit **https://tools.rgb-b.com** — should be live immediately.

---

## Infrastructure Reference

**Tunnel config:** `~/.cloudflared/config.yml`
```
tunnel: 298a0402-1fa7-4a89-b7d1-3f42995dc6cb
ingress:
  - hostname: tools.rgb-b.com
    service: http://localhost:8081
  - hostname: colour.rgb-b.com
    service: http://localhost:8082
  - hostname: xrite-export.elphiene.com
    service: http://localhost:8181
  - service: http_status:404
```

**App service:** `/etc/systemd/system/brandpack-tools.service`
- User: `el`
- Working dir: `/home/el/Documents/El-Projects/brandpack-tools/server`
- Env file: `server/.env` (PORT=8081, NODE_ENV=production)
- DB: `server/data/brandpack.db`

---

## Common Operations

**Check status**
```bash
./brandpack.sh status
```

**View logs**
```bash
./brandpack.sh logs prod          # last 50 lines
./brandpack.sh tail prod          # live follow
sudo journalctl -u brandpack-tools.service -f
```

**Deploy an update**
```bash
git pull origin main
./brandpack.sh deploy             # builds client + restarts prod
```

**Manual restart**
```bash
sudo systemctl restart brandpack-tools.service
sudo systemctl restart cloudflared
```

**Health check**
```bash
curl http://localhost:8081/api/health
```

---

## Tunnel Operations

**Restart tunnel (if DNS changes don't resolve)**
```bash
sudo systemctl restart cloudflared
```

**Add a new hostname to the tunnel**
1. Edit `~/.cloudflared/config.yml` — add ingress rule before the catch-all
2. Add CNAME in Cloudflare DNS (same target as above)
3. `sudo systemctl restart cloudflared`

**Check tunnel status**
```bash
cloudflared tunnel info 298a0402-1fa7-4a89-b7d1-3f42995dc6cb
sudo journalctl -u cloudflared -n 50
```
