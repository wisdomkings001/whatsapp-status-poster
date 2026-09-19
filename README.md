# Status Queue — WhatsApp Status Auto-Poster

Posts your product images to your WhatsApp Status automatically, on a schedule you control:

- One **fixed daily opener** image, posted at a random time inside a window you set (default 7–8am), always tagged "Now Opened 🔓".
- A **shuffled batch of regular products** each day (you set a min/max quota, or override a specific day's count — e.g. 9 today, 8 tomorrow, 20 the day after).
- **48-hour cooldown** (configurable) — a product won't repeat until the cooldown passes.
- **Randomized intervals** between posts (default 30–90 minutes, configurable).
- A **web admin panel** to upload products, manage captions, tweak scheduling rules, and see what's queued.

It uses `whatsapp-web.js`, an unofficial library that automates a real WhatsApp Web session — there is no official WhatsApp API for posting to Status. Read [Important limitations](#important-limitations-read-this) before relying on this for a business number.

---

## 1. How it works

```
Admin panel (upload products, set rules)
        │
        ▼
   SQLite database  ──►  Scheduler (builds each day's queue, spaces out posts)
        │                        │
        │                        ▼
        │                whatsapp-web.js  ──►  Your phone's WhatsApp session ──► Status
        ▼
  /uploads/products (image files)
```

The whole thing is one Node.js process: the admin panel (Express) and the WhatsApp bot run together. It needs to stay running 24/7 for scheduled posts to fire — see the deployment section.

---

## 2. Local setup (test on your own machine first)

**Requirements:** Node.js 18+, npm, and a phone with WhatsApp installed.

```bash
# 1. Unzip / clone the project, then:
cd whatsapp-status-poster
npm install

# 2. Create your .env file
cp .env.example .env

# 3. Generate your admin password hash
node scripts/hash-password.js "YourChosenPassword123"
# Copy the printed ADMIN_PASSWORD_HASH line into .env

# 4. Edit .env — at minimum set:
#    ADMIN_USERNAME, ADMIN_PASSWORD_HASH, SESSION_SECRET (any long random string)

# 5. Start it
npm start
```

You'll see something like:

```
[INFO] Admin panel running at http://localhost:3000
Scan this QR code with WhatsApp (Linked Devices > Link a Device):
[QR code printed here in the terminal]
```

**Scan the QR code:** on your phone, open WhatsApp → Settings → Linked Devices → Link a Device, and scan the code shown in your terminal. Once scanned, the terminal logs:

```
[INFO] WhatsApp authenticated successfully.
[INFO] WhatsApp client is ready. Bot can now post to Status.
```

The session is saved to `.wwebjs_auth/` so you won't need to re-scan on every restart, only if you log out from your phone or delete that folder.

Now open `http://localhost:3000` in your browser, log in with the admin credentials you set, and start adding products.

---

## 3. Using the admin panel

- **Add a product** — upload an image, optionally give it a fixed caption, and tick "Use as the fixed daily opener" for the one product that should post every morning as your "Now Opened" slot. Only one product can be the opener at a time — setting a new one automatically unsets the old one.
- **Products grid** — shows every product, lets you deactivate (skip without deleting), delete, or change which one is the opener.
- **Generic caption pool** — short lines like "Available now, grab yours" that get randomly paired with each regular product's own caption.
- **Scheduling rules** — opener time window, min/max minutes between posts, min/max daily quota, cooldown hours, and the opener's caption text.
- **Override today's quota** — set an exact number of regular posts for just today (e.g. type 20), without changing your normal min/max range.
- **Today's queue** — shows what's currently scheduled and when. Click **Rebuild plan** any time you change products or settings to regenerate today's queue immediately.
- **Recent posts** — a log of what's actually been posted, with timestamps.

---

## 4. Important limitations (read this)

- **No official API.** WhatsApp does not provide an API for posting to Status, for any account type (personal or Business). This tool works by automating a real WhatsApp Web session (`whatsapp-web.js` + a headless Chromium browser), the same way a browser tab would.
- **Ban risk.** Because this isn't official, WhatsApp can flag or restrict numbers that post very frequently or in patterns that look automated. Posting 20 times a day, every day, is more likely to draw attention than a smaller, more human-paced schedule. Consider:
  - Using a secondary number for this rather than your primary personal or business number.
  - Keeping quotas and intervals in a realistic range rather than maxing them out constantly.
  - Watching for warnings and pausing/adjusting if your account behaves oddly.
- **One phone, one session.** The number you scan the QR code with must stay logged into that WhatsApp Web session; if you log out from your phone, the bot loses connection and needs a re-scan.
- **This project has no official affiliation with WhatsApp/Meta.**
- **Known current issue: QR pairing can silently fail.** As of this build, `whatsapp-web.js` has an open, actively-discussed compatibility gap with recent WhatsApp backend changes — the QR code scans fine on your phone, but the "linked" handshake never completes and WhatsApp shows "Couldn't link device." This isn't specific to any one hosting setup (Termux, a VPS, or Railway can all hit it) — it depends on whether the library has caught up to WhatsApp's latest changes at the time you're running it. If you hit this:
  - Try again after a few days — these gaps do get patched, just not on a fixed schedule.
  - Check the [whatsapp-web.js GitHub issues](https://github.com/pedroslopez/whatsapp-web.js/issues) for the current status and any workaround being discussed.
  - `yarn add whatsapp-web.js@latest` (or `npm install whatsapp-web.js@latest`) periodically to pick up fixes as they ship.

---

## 5. Deploying with GitHub + Railway (recommended — easiest path)

This is the simplest way to get this running 24/7: push the project to a GitHub repo, connect Railway to it, and Railway builds and runs it in a real Linux container using the included `Dockerfile` (which installs a proper Chromium — no Termux/proot workarounds needed).

### 5.1 Push the project to GitHub

On your own computer (not Termux — any machine with git is fine):

```bash
cd whatsapp-status-poster
git init
git add .
git commit -m "Initial commit"
```

Create a new empty repository on [github.com](https://github.com/new) (don't initialize it with a README), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

### 5.2 Create the Railway project

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **New Project → Deploy from GitHub repo**, and pick the repo you just pushed.
3. Railway will detect the `Dockerfile` in the project and build from it automatically — no extra configuration needed for that part.

### 5.3 Add a persistent volume

Without this, your product catalog and WhatsApp login session get wiped every time Railway redeploys. In your Railway project:

1. Go to your service → **Settings → Volumes**.
2. Add a volume, mount it at `/app/data-store` (or any path you like).
3. Since the app expects its data under `/app/data`, `/app/uploads`, and `/app/.wwebjs_auth`, the simplest fix is to mount **three** small volumes at those exact paths — or one volume at `/app` root if Railway's plan allows it. (Check current Railway docs for volume specifics, since their UI changes.)

### 5.4 Set environment variables

In your Railway service → **Variables**, add the same values from `.env.example`:

```
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<generate locally first, see below>
SESSION_SECRET=<any long random string>
OPENER_WINDOW_START=07:00
OPENER_WINDOW_END=08:00
MIN_INTERVAL_MINUTES=30
MAX_INTERVAL_MINUTES=90
MIN_DAILY_QUOTA=6
MAX_DAILY_QUOTA=12
COOLDOWN_HOURS=48
```

To generate `ADMIN_PASSWORD_HASH`, run this on any machine with Node.js installed (your own computer is fine):
```bash
node scripts/hash-password.js "YourChosenPassword123"
```
Copy the printed hash into Railway's variable.

**Don't set `PUPPETEER_EXECUTABLE_PATH`** here — the `Dockerfile` already sets it internally for the container's Chromium.

### 5.5 Deploy and scan the QR code

Railway will build and start the service automatically. Once it's running:

1. Open the public URL Railway gives your service (Settings → Networking → Generate Domain if you haven't already).
2. Log into the admin panel with the username/password you set.
3. A **QR code image now appears directly at the top of the admin panel** (not just in server logs) whenever WhatsApp isn't connected yet — scan it with your phone: **WhatsApp → Settings → Linked Devices → Link a Device**.
4. Once scanned, the banner disappears and the status pill shows "WhatsApp: connected".

### 5.6 Ongoing use

- Add/manage products through the admin panel as normal.
- If Railway redeploys (e.g. you push a code change), the WhatsApp session persists as long as your volume is set up correctly — you shouldn't need to re-scan.
- Railway's free tier includes limited monthly usage credit; running Chromium 24/7 does consume real memory/CPU, so keep an eye on usage if you're on a free plan. A small paid plan (a few dollars/month) removes that concern entirely.

---

## 5b. Alternative: a plain VPS (DigitalOcean, Hetzner, etc.)

If you'd rather not use Railway, the same Dockerfile-free approach works on any Ubuntu VPS you SSH into directly.

### 5.1 Get a server

1. Create a droplet/VPS: **Ubuntu 22.04**, cheapest tier is enough (1GB RAM minimum recommended, since Chromium is memory-hungry).
2. Note its IP address and SSH in:
   ```bash
   ssh root@your_server_ip
   ```

### 5.2 Install Node.js and system dependencies

```bash
# Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Chromium dependencies (whatsapp-web.js needs these to run headless Chrome)
apt-get install -y \
  gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
  libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
  libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation \
  libnss3 lsb-release xdg-utils wget build-essential
```

`build-essential` is needed because `better-sqlite3` compiles a small native module on install.

### 5.3 Upload the project

From your local machine:

```bash
scp -r whatsapp-status-poster root@your_server_ip:/opt/
```

Or clone from your own git repo if you push it there.

### 5.4 Install and configure

```bash
ssh root@your_server_ip
cd /opt/whatsapp-status-poster
npm install

cp .env.example .env
node scripts/hash-password.js "YourChosenPassword123"
nano .env   # paste in ADMIN_PASSWORD_HASH, set ADMIN_USERNAME, SESSION_SECRET, PORT
```

Set a strong `SESSION_SECRET` (any long random string) and a real password — this panel controls what gets posted publicly to your Status.

### 5.5 First run — scan the QR code

Run it directly first (not via PM2 yet) so you can see the QR code and scan it:

```bash
node server.js
```

Scan the printed QR code with your phone (WhatsApp → Settings → Linked Devices → Link a Device). Wait for:

```
[INFO] WhatsApp client is ready. Bot can now post to Status.
```

Then stop it with `Ctrl+C`. The session is now saved in `.wwebjs_auth/` and will persist across restarts.

### 5.6 Run it permanently with PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # follow the printed instructions to enable PM2 on server reboot
```

Useful PM2 commands:

```bash
pm2 status              # check it's running
pm2 logs status-queue   # tail logs (watch for post confirmations / errors)
pm2 restart status-queue
```

### 5.7 Open the admin panel

Visit `http://your_server_ip:3000` in your browser (open port 3000 in your firewall/security group if needed: `ufw allow 3000`).

For a proper domain + HTTPS instead of a bare IP:port, put **Nginx** in front as a reverse proxy and get a free certificate with **Certbot**:

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

Nginx site config (`/etc/nginx/sites-available/status-queue`):

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/status-queue /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.com
```

### 5.8 Ongoing use

- Add/manage products anytime through the admin panel — no restart needed, the scheduler picks up changes the next time it rebuilds the plan (midnight, or manually via **Rebuild plan**).
- If you ever get logged out on WhatsApp (phone unlinked it, etc.), SSH in and run `pm2 logs status-queue` — you'll see a QR prompt in the logs. You'll need `pm2 stop status-queue`, then run `node server.js` directly once to re-scan, then `pm2 start status-queue` again.
- Back up the `data/app.db` file periodically — it holds your entire product catalog, captions, and settings.

---

## 6. Project structure

```
whatsapp-status-poster/
├── server.js                 # Express app entry point
├── ecosystem.config.js       # PM2 process config
├── scripts/hash-password.js  # Generates your admin password hash
├── src/
│   ├── db.js                 # SQLite schema + defaults
│   ├── middleware/auth.js    # Session auth guard
│   ├── routes/
│   │   ├── auth.js           # Login/logout
│   │   ├── products.js       # Product CRUD + image upload + caption pool
│   │   └── settings.js       # Scheduling rules + daily overrides + post log
│   ├── whatsapp/bot.js       # whatsapp-web.js client wrapper
│   ├── scheduler/scheduler.js# Daily queue builder + timers
│   └── utils/logger.js
├── public/                   # Admin panel (static HTML/CSS/JS)
├── uploads/products/         # Uploaded product images live here
└── data/app.db                # SQLite database (created on first run)
```

---

## 7. Scan output — what a healthy startup looks like

The QR code now appears as an actual image at the top of the admin panel in your browser (much easier to scan than reading it off a log viewer) — but it's also still printed in the logs as a fallback, in case you're checking via `railway logs` or SSH:

```
[INFO] Admin panel running at http://localhost:3000
New QR code ready. Scan it from the admin panel, or use the terminal version below:
█████████████████████████
██ ▄▄▄▄▄ █▀█ █▄▄██ ▄▄▄▄▄ ██
██ █   █ █▀▀▀█ ▀▄█ █   █ ██
██ █▄▄▄█ █▀ █▀▀▄▀█ █▄▄▄█ ██
██▄▄▄▄▄▄▄█▄▀▄█ █▄█▄▄▄▄▄▄▄██
   ... (QR code block continues) ...
[INFO] WhatsApp authenticated successfully.
[INFO] WhatsApp client is ready. Bot can now post to Status.
[INFO] Today's plan built: 7 post(s) scheduled.
[INFO]   - opener | product #1 | 9/18/2026, 7:24:10 AM
[INFO]   - regular | product #5 | 9/18/2026, 8:41:10 AM
[INFO]   - regular | product #2 | 9/18/2026, 9:52:10 AM
...
[INFO] Posted opener product #1 to Status.
[INFO] Posted regular product #5 to Status.
```

If you see `WARN: No product is marked as the daily opener` — go set one in the admin panel and click **Rebuild plan**. If you see `WARN: Only N eligible products available (wanted Q)` — add more products or lower your quota/cooldown, since everything else is still on cooldown.

---

## 8. Testing performed before delivery

Since a real WhatsApp scan can't happen in a sandboxed build environment, everything **except** the actual Status post was tested end-to-end against the real server:

- ✅ All source files pass `node --check` (no syntax errors)
- ✅ Clean `npm install` and database auto-creation/seeding
- ✅ Login flow: wrong password rejected (401), correct password succeeds, session persists
- ✅ Every `/api/*` route correctly rejects unauthenticated requests (401 JSON, not a silent redirect)
- ✅ Image upload accepted; non-image files rejected (400, not a 500 crash)
- ✅ Setting a product as daily opener automatically un-sets any previous opener
- ✅ Product delete removes both the DB row and its image file
- ✅ Caption pool add/delete
- ✅ Scheduler correctly: excludes products still inside the 48h cooldown, includes only one opener, applies the today-override quota, and spaces regular posts using randomized intervals within the configured min/max range
- ✅ Full server boot cycle with real HTTP requests (curl) against every endpoint

The only step that requires your own phone is scanning the WhatsApp QR code — that can't be simulated.
