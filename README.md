# 🇳🇱 NL Naturalisation Monitor

An agentic AI app that monitors Dutch government sources for any policy change to the naturalisation language requirement (currently A2, watching for a raise to B1 or beyond). When a change is detected, it automatically sends you an email with the relevant links and excerpts.

**Stack:** Node.js (Express + node-cron) · React · Claude AI (claude-sonnet-4) · Nodemailer

---

## How it works

```
┌─────────────────────────────────────────────────────────┐
│  Every 6 hours (cron)                                   │
│                                                         │
│  1. Scrape 4 official Dutch gov / IND sources          │
│  2. Send content to Claude for intelligent analysis     │
│  3. Claude returns: changeDetected, summary, links…    │
│  4. If changeDetected → send email with links          │
│  5. Log result for the dashboard                        │
└─────────────────────────────────────────────────────────┘
```

---

## Local setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd nl-naturalisation-monitor
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...          # Get from console.anthropic.com
EMAIL_SERVICE=gmail
EMAIL_USER=your@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx        # Gmail App Password (NOT your real password)
EMAIL_TO=where_alerts_go@example.com
CRON_SCHEDULE=0 */6 * * *             # Every 6 hours — adjust as needed
PORT=3001
```

> **Gmail App Password:** Go to myaccount.google.com → Security → 2-Step Verification → App passwords → create one for "Mail".

### 3. Run locally

```bash
npm run dev
```

- React dashboard → http://localhost:3000
- API server → http://localhost:3001

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Agent status, last run, schedule |
| GET | `/api/logs` | Last 20 run results |
| GET | `/api/sources` | List of monitored sources |
| POST | `/api/run` | Trigger immediate run (no forced email) |
| POST | `/api/run-with-email` | Trigger run AND always send email (test mode) |

---

## Vercel Deployment

### Prerequisites
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
- A Vercel account (free tier works)

---

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: NL naturalisation monitor"
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

---

### Step 2 — Import project on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"**
3. Select your GitHub repo
4. Under **"Framework Preset"**, select **"Create React App"**
5. Leave the default build settings (`npm run build`, output `build/`)
6. Click **"Deploy"** — this first deploy will probably fail on env vars; that's expected

---

### Step 3 — Add environment variables on Vercel

In your Vercel project → **Settings → Environment Variables**, add:

| Name | Value | Environments |
|------|-------|--------------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Production, Preview |
| `EMAIL_SERVICE` | `gmail` | Production, Preview |
| `EMAIL_USER` | `your@gmail.com` | Production, Preview |
| `EMAIL_PASS` | `xxxx xxxx xxxx xxxx` | Production, Preview |
| `EMAIL_TO` | `recipient@email.com` | Production, Preview |
| `CRON_SCHEDULE` | `0 */6 * * *` | Production, Preview |
| `NODE_ENV` | `production` | Production |

---

### Step 4 — Redeploy

```bash
# Option A: Trigger from Vercel dashboard (Deployments → Redeploy)

# Option B: Via CLI
vercel --prod
```

---

### Step 5 — Verify the cron

> ⚠️ **Important Vercel limitation:** The Express `node-cron` scheduler only runs while the server is awake. Vercel's serverless functions sleep between requests, so the cron will NOT fire automatically on the free/hobby plan.

**Solutions (pick one):**

#### Option A — External cron trigger (recommended for free plan)

Use [cron-job.org](https://cron-job.org) (free) to call your endpoint:

1. Sign up at cron-job.org
2. Create a new cron job:
   - **URL:** `https://your-app.vercel.app/api/run`
   - **Method:** POST
   - **Schedule:** Every 6 hours
3. That's it — the HTTP request wakes the function and runs the agent

#### Option B — Vercel Cron Jobs (Pro plan or Hobby with limits)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/run",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

Then make `api/run` a standalone serverless function instead of an Express route (requires minor refactoring into `/api/run.js`).

#### Option C — Self-host on Railway / Render (free tiers available)

These platforms keep your Node.js server alive continuously, so `node-cron` works natively:

- **Railway:** `railway up` (connect your GitHub repo)
- **Render:** Create a "Web Service" from your GitHub repo

---

### Step 6 — Test end-to-end

After deployment:

```bash
# Test manual run (no email forced)
curl -X POST https://your-app.vercel.app/api/run

# Test with forced email (verifies email config works)
curl -X POST https://your-app.vercel.app/api/run-with-email

# Check status
curl https://your-app.vercel.app/api/status

# Check logs
curl https://your-app.vercel.app/api/logs
```

---

## Customisation

### Change the cron schedule

Edit `CRON_SCHEDULE` in your `.env`:

```
0 */6 * * *    ← every 6 hours (default)
0 9 * * *      ← once daily at 9am
0 */1 * * *    ← every hour
```

### Add more sources

In `api/agent.js`, add to the `SOURCES` array:

```js
{
  name: "My custom source",
  url: "https://example.com/page",
  selector: "main", // CSS selector for content area
},
```

### Change email provider

Update `EMAIL_SERVICE` in `.env`. Supported services: `gmail`, `yahoo`, `outlook`, `hotmail`, `sendgrid`, etc. For SMTP, see nodemailer docs.

---

## Sources monitored

| Source | URL |
|--------|-----|
| IND – Naturalisation conditions (EN) | https://ind.nl/en/dutch-citizenship/naturalisation |
| Government.nl – Applying for Dutch citizenship | https://www.government.nl/topics/dutch-nationality/applying-for-dutch-naturalisation |
| Rijksoverheid – Naturalisatie (NL) | https://www.rijksoverheid.nl/onderwerpen/nederlanderschap/naturalisatie |
| IND – Naturalisatie (NL) | https://ind.nl/nl/naturalisatie |

---

## Licence

MIT
