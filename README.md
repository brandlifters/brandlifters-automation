# BrandLifters Automation

Automation pipeline for publishing BrandLifters demo websites to GitHub, Vercel, and Framer.

---

## How the system works

```
You (manual)               Automation                    External Services
─────────────              ──────────────────────────    ───────────────────
1. Generate demo site  →   publish-demo CLI
2. Review locally      →   (your approval)
3. Run publish-demo    →   → Create GitHub repo
                           → Push code
                           → Create Vercel project        → GitHub
                                                          → Vercel auto-deploys
                           (Vercel sends webhook) ←       ← Vercel webhook
                           → Capture screenshot            → Playwright
                           → Generate thumbnail            → Sharp
                           → Create Framer CMS item        → Framer API
                           → Publish Framer site           → Framer API
                                                  ↓
                                        Live on your portfolio ✔
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

Install Playwright's Chromium browser:

```bash
npx playwright install chromium
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in all values in `.env`. Required variables:

| Variable | Where to get it |
|---|---|
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens (needs `repo` scope) |
| `GITHUB_OWNER` | Your GitHub username or org |
| `VERCEL_TOKEN` | Vercel dashboard → Settings → Tokens |
| `VERCEL_TEAM_ID` | Vercel dashboard → Team settings (leave blank for personal accounts) |
| `FRAMER_API_KEY` | Framer project → Settings → Server API |
| `FRAMER_COLLECTION_ID` | Framer CMS → your portfolio collection → collection ID in the URL |
| `WEBHOOK_SECRET` | Any random string — you set this in both `.env` AND in the Vercel webhook config |

### 3. Build (for production)

```bash
npm run build
```

---

## Part 1 — Running the publish command

From inside a demo website directory that contains `demo.config.json`:

```bash
npm run publish-demo
```

Or point to a specific demo directory:

```bash
npm run publish-demo -- --path /path/to/demo-dental-clinic
```

This will:
1. Validate `demo.config.json`
2. Create the GitHub repo (if it doesn't exist)
3. Push all code to GitHub
4. Create the Vercel project linked to GitHub (if it doesn't exist)

After this, Vercel auto-deploys from the GitHub push. The webhook server handles everything else.

---

## Part 2 — Deploying the webhook server

The webhook server must be publicly accessible so Vercel can POST to it.

### Run locally (for testing with a tunnel)

```bash
npm run dev
```

Then use [ngrok](https://ngrok.com/) or similar to expose it:

```bash
ngrok http 3000
```

Copy the `https://` ngrok URL for the next step.

### Deploy to production

Recommended platforms: **Railway**, **Render**, or **Fly.io** (all have free tiers).

Set the same environment variables from your `.env` file in the platform's dashboard.

### Configure the Vercel webhook

1. Go to: Vercel dashboard → your team/account → Settings → Webhooks
2. Click **Add Webhook**
3. Set the URL to: `https://your-server.com/api/vercel-webhook`
4. Set the **Secret** to the same value as `WEBHOOK_SECRET` in your `.env`
5. Select the **deployment.succeeded** event (and optionally `deployment.error`)
6. Save

---

## demo.config.json

Every demo website repo must include this file in its root directory.

```json
{
  "name": "dental-clinic-demo",
  "industry": "Dental Clinic",
  "title": "SmileBright Dental",
  "description": "A modern, conversion-focused website for a dental clinic.",
  "tags": ["healthcare", "dental", "local-business"],
  "primaryColor": "#2A9D8F",
  "repoName": "demo-dental-clinic",
  "vercelProjectName": "demo-dental-clinic",
  "localPath": "../demos/dental-clinic",
  "previewUrl": ""
}
```

| Field | Required | Description |
|---|---|---|
| `name` | ✔ | Unique kebab-case identifier |
| `industry` | ✔ | Human-readable industry label |
| `title` | ✔ | Fake business name |
| `description` | ✔ | Portfolio card description |
| `tags` | – | Optional array of tags |
| `primaryColor` | – | Brand hex colour for thumbnail overlays |
| `repoName` | ✔ | GitHub repo name (lowercase, hyphens only) |
| `vercelProjectName` | ✔ | Vercel project name (lowercase, hyphens only) |
| `localPath` | ✔ | Path to the demo code (used by publish-demo) |
| `previewUrl` | ✔ | Leave empty — automation fills this after deployment |

---

## Project structure

```
brandlifters-automation/
├── src/
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   ├── config/
│   │   └── env.ts                # Env var loading + validation
│   ├── utils/
│   │   ├── logger.ts             # Winston logger
│   │   └── config-loader.ts      # demo.config.json reader
│   ├── services/
│   │   ├── github.ts             # GitHub API (create repo, push)
│   │   ├── vercel.ts             # Vercel API (create project, deploy)
│   │   ├── framer.ts             # Framer CMS API (create item, publish)
│   │   ├── screenshot.ts         # Playwright screenshot capture
│   │   └── thumbnail.ts          # Sharp thumbnail generator
│   ├── scripts/
│   │   └── publish-demo.ts       # CLI entry point
│   └── api/
│       ├── server.ts             # Express webhook server
│       └── routes/
│           └── vercel-webhook.ts # Webhook handler
├── output/                       # Generated files (gitignored)
│   ├── screenshots/
│   ├── thumbnails/
│   ├── snapshots/
│   └── logs/
├── .env.example
├── .gitignore
├── demo.config.example.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## Testing each step independently

**Step 1 — Validate config only:**
Run `publish-demo` against a demo with `demo.config.json`. Check the logged output.

**Step 2 — Test GitHub push:**
After `publish-demo` completes, verify the repo at `github.com/<your-username>/<repoName>`.

**Step 3 — Test Vercel project:**
Check the Vercel dashboard for a project named `vercelProjectName`.

**Step 4 — Test the webhook locally:**
Start the dev server (`npm run dev`) and expose it with ngrok. Trigger a manual Vercel deployment and watch the server logs.

**Step 5 — Test screenshot:**
The screenshot is saved to `./output/screenshots/<site-name>.png` after every webhook trigger.

**Step 6 — Test Framer:**
Check your Framer CMS collection for the new item after a successful webhook run.

---

## Future phases (not built yet)

- Automated social media posting after publish
- Analytics tracking per demo site
- Multiple design templates
- Batch demo generation from an industry list
