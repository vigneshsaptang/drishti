# Saptang Intelligence — server deployment (custom domain)

Short path: a Linux server with Docker, one public domain, DNS pointed at the server, and environment variables in `.env`. Caddy terminates TLS and forwards to the app.

## 1. What you need

- A **VPS** (e.g. Ubuntu 22.04) with a public **IPv4** (and **IPv6** if you use AAAA).
- A **domain** you control (e.g. `intel.example.com` or `example.com`).
- **MongoDB** reachable from that server (same machine, private network, or allowlisted IP) for the three `MONGO_URI_*` values.
- **Docker** and **Docker Compose** v2 on the server.

## 2. Point DNS to the server

| Type | Name        | Value        |
|------|-------------|--------------|
| A    | `intel` (or `@`) | your server public IP |
| AAAA | (optional)  | server IPv6 if you use it |

Wait until the record propagates (often minutes; use `dig +short your.domain` to confirm).

**TLS:** Caddy in this project serves the site name from `DOMAIN` in `.env` and will request a **Let’s Encrypt** certificate automatically when the domain resolves to this host and **ports 80 and 443** reach Caddy on this machine.

## 3. Open the firewall

Allow SSH and HTTP/HTTPS only (adjust if you use a custom SSH port):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do **not** expose the backend API port **8000** to the public internet. Either:

- **Recommended:** after testing, **remove** the `ports` mapping for `backend` in `docker-compose.yml` in production (only Caddy on the `sigint` Docker network should talk to `backend:8000`), **or**
- use a host firewall so **8000** is not allowed from the WAN (only 80/443).

## 4. Get the code on the server

```bash
git clone <your-repo-url> /opt/sigint
cd /opt/sigint
```

(Or copy the `sigint` folder; keep paths consistent for what follows.)

## 5. Configure `.env`

```bash
cp .env.example .env
nano .env   # or vim
```

Set at least:

| Variable | Production notes |
|----------|------------------|
| `DOMAIN` | Your public hostname, e.g. `intel.example.com` (no `https://`) |
| `ADMIN_EMAIL` | A real address (useful for ACME/Let’s Encrypt account contact if you add it in Caddy) |
| `MONGO_URI_CREDMON` | Production Mongo connection string |
| `MONGO_URI_DARKMON` | Same |
| `MONGO_URI_FTI` | Same |
| `BACKEND_PORT` | Keep `8000` inside the stack unless you change the Docker network wiring |
| `LOG_LEVEL` | `info` or `warning` |
| `WORKERS` | e.g. `2`–`4` per core; tune to CPU/RAM |

Never commit `.env` or put secrets in git.

## 6. Optional: ACME / Let’s Encrypt email in Caddy

Caddy can obtain certificates without extra config. If you want to set a contact email for ACME, add a **global** block at the **top** of `Caddyfile`:

```caddy
{
	email you@example.com
}

{$DOMAIN:localhost} {
	# ... rest unchanged
}
```

Then `docker compose up -d` again (see below).

## 7. Build and run

From the `sigint` directory (where `docker-compose.yml` lives):

```bash
docker compose up -d --build
```

Check that containers are running:

```bash
docker compose ps
docker compose logs -f caddy
docker compose logs -f backend
```

## 8. Verify

- In a browser: `https://your.domain` (or `http://` first; Caddy may redirect to HTTPS once the cert is issued).
- If HTTPS fails, confirm **DNS** points here, **80/443** are open, and no other process uses them.

## 9. Day‑2 operations

- **Updates:** `git pull` → `docker compose up -d --build`
- **Backups:** MongoDB (your DBA process), and any Caddy/compose volumes if you customize them
- **Logs:** `docker compose logs -f backend` (or `-f` on all services)

## 10. If something breaks

- **“Certificate problem”** — wait for DNS; check port 80 from outside (Let’s Encrypt HTTP-01); check Caddy logs.
- **502 / bad gateway** — `docker compose logs backend`; confirm MongoDB URIs and that the `backend` container is healthy.
- **Frontend loads, API doesn’t** — the SPA calls `/api/...` through the same host; Caddy should proxy everything to the backend. Confirm you open the app via the **Caddy** URL (`DOMAIN`), not a raw port that bypasses the proxy (unless you intentionally expose the backend for debugging only).

This stack is a **sensitive** investigation tool: put it behind a VPN, IP allowlist, or SSO in front of Caddy for production if your policy requires it. This file only covers “domain + Docker on a server” basics.
