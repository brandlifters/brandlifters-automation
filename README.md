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

## Folder layout (important)

All commands are **always run from the automation repo**, not from the demo folder.

```
brandlifters-material/
├── brandlifters-automation/   ← YOU ARE ALWAYS IN HERE when running commands
│   ├── src/
│   ├── .env
│   ├── package.json
│   └── ...
└── brandlifters-demo/
    └── barber-demo/           ← demo sites live here — you pass the path as an argument
        ├── demo.config.json
        └── index.html / etc.
```

---

## Setup

### 1. Install dependencies

Run this once from inside the automation repo:

```powershell
cd C:\Users\abdul\brandlifters-material\brandlifters-automation
npm install
npx playwright install chromium
```

### 2. Configure environment variables

```powershell
copy .env.example .env
```

Fill in all values in `.env`:

| Variable | Where to get it |
|---|---|
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens (classic) — needs `repo` and `delete_repo` scopes |
| `GITHUB_OWNER` | `brandlifters` |
| `VERCEL_TOKEN` | Vercel dashboard → Settings → Tokens |
| `VERCEL_TEAM_ID` | Leave blank (personal account) |
| `FRAMER_API_KEY` | Framer project → Settings → Server API |
| `FRAMER_COLLECTION_ID` | Framer CMS → your portfolio collection → collection ID in the URL |
| `WEBHOOK_SECRET` | Any random string — set the same value in Vercel dashboard when creating the webhook |

---

## Running the publish command

### Always run from the automation repo

```powershell
cd C:\Users\abdul\brandlifters-material\brandlifters-automation
```

> **Important:** Use `npx ts-node` directly — **not** `npm run publish-demo --`.
> npm intercepts flags like `--path` and `--github-only` before they reach the script, silently dropping them.

### Publish GitHub only (use this first — when Vercel token is not yet set)

```powershell
npx ts-node src/scripts/publish-demo.ts --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo" --github-only
```

This will:
1. Read and validate `demo.config.json` from the demo folder
2. Create the GitHub repo (e.g. `github.com/brandlifters/demo-barber-shop`)
3. Set the git identity (`brandlifters / brandliftersseo@gmail.com`) on the demo repo
4. Set the SSH remote (`git@github-brandlifters:brandlifters/demo-barber-shop.git`)
5. Commit and push the code

### Full publish (GitHub + Vercel — use once VERCEL_TOKEN is in .env)

```powershell
npx ts-node src/scripts/publish-demo.ts --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo"
```

This does everything above plus:
- Creates the Vercel project linked to the GitHub repo
- Vercel auto-deploys from the push
- The webhook server handles the rest (screenshot → Framer)

### Swapping in a different demo

Just change the `--path` to point at a different demo folder. Each demo folder needs its own `demo.config.json`.

```powershell
npx ts-node src/scripts/publish-demo.ts --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\dental-demo" --github-only
```

---

## demo.config.json

Every demo folder must contain this file. The automation reads it — nothing is guessed.

```json
{
  "name": "barber-demo",
  "industry": "Barber Shop",
  "title": "Northline Barbers",
  "description": "A premium barber shop demo website.",
  "tags": ["barber", "local"],
  "primaryColor": "#111111",
  "repoName": "demo-barber-shop",
  "vercelProjectName": "demo-barber-shop",
  "localPath": "C:/Users/abdul/brandlifters-material/brandlifters-demo/barber-demo",
  "previewUrl": ""
}
```

| Field | Required | Description |
|---|---|---|
| `name` | ✔ | Unique kebab-case identifier for this demo |
| `industry` | ✔ | Human-readable industry label shown on the portfolio card |
| `title` | ✔ | Fake business name |
| `description` | ✔ | Short description for the portfolio card |
| `tags` | – | Optional array of tags |
| `primaryColor` | – | Brand hex colour |
| `repoName` | ✔ | GitHub repo name — lowercase, hyphens only |
| `vercelProjectName` | ✔ | Vercel project name — lowercase, hyphens only |
| `localPath` | ✔ | **Absolute path** to the demo folder on your machine |
| `previewUrl` | ✔ | Leave as empty string — automation fills it after deployment |

---

## Git identity (how BrandLifters repos are targeted)

Any repo under `brandlifters-material` is automatically configured to use the BrandLifters GitHub account. The automation sets these on every push — you never have to do it manually:

```
git config user.name   "brandlifters"
git config user.email  "brandliftersseo@gmail.com"
git remote origin      git@github-brandlifters:brandlifters/<repo>.git
```

These are **local** settings — only apply inside each demo repo's `.git/config`. Your global git identity is untouched.

To manually apply this to any existing repo under `brandlifters-material`:

```powershell
cd C:\Users\abdul\brandlifters-material\brandlifters-automation
npx ts-node src/scripts/configure-repo.ts --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo"
```

Full explanation: [docs/git-account-targeting.md](docs/git-account-targeting.md)

---

## Webhook server (Part 2 — after Vercel is set up)

The webhook server receives Vercel deployment events and runs the screenshot → Framer pipeline.

### Run locally for testing

```powershell
cd C:\Users\abdul\brandlifters-material\brandlifters-automation
npm run dev
```

Expose it publicly with ngrok so Vercel can reach it:

```powershell
ngrok http 3000
```

### Deploy to production

Recommended: **Railway**, **Render**, or **Fly.io** (free tiers available). Set the same env vars from your `.env` in the platform dashboard.

### Configure the Vercel webhook

1. Vercel dashboard → Settings → Webhooks → **Add Webhook**
2. URL: `https://your-server.com/api/vercel-webhook`
3. Secret: same value as `WEBHOOK_SECRET` in `.env`
4. Event: `deployment.succeeded`
5. Save

---

## Project structure

```
brandlifters-automation/
├── src/
│   ├── types/index.ts                # Shared TypeScript types
│   ├── config/env.ts                 # Env var loading + validation (zod)
│   ├── utils/
│   │   ├── logger.ts                 # Winston logger (console + file)
│   │   ├── config-loader.ts          # Reads + validates demo.config.json
│   │   └── git-identity.ts           # BrandLifters git account targeting
│   ├── services/
│   │   ├── github.ts                 # GitHub API — create repo, push via SSH
│   │   ├── vercel.ts                 # Vercel API — create project, deploy
│   │   ├── framer.ts                 # Framer CMS — create item, publish
│   │   ├── screenshot.ts             # Playwright screenshot capture
│   │   └── thumbnail.ts              # Sharp thumbnail generator
│   ├── scripts/
│   │   ├── publish-demo.ts           # CLI: npm run publish-demo
│   │   └── configure-repo.ts         # CLI: npm run configure-repo
│   └── api/
│       ├── server.ts                 # Express webhook server
│       └── routes/vercel-webhook.ts  # Webhook handler + post-deploy pipeline
├── docs/
│   └── git-account-targeting.md      # How BrandLifters git targeting works
├── output/                           # Generated files (gitignored)
│   ├── screenshots/
│   ├── thumbnails/
│   ├── snapshots/
│   └── logs/
├── .env                              # Your secrets (never commit this)
├── .env.example                      # Template — copy to .env
├── demo.config.example.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## Testing each step independently

**Token valid?**
```powershell
cd C:\Users\abdul\brandlifters-material\brandlifters-automation
node -e "require('dotenv').config(); fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, 'User-Agent': 'test' } }).then(r => r.json()).then(d => console.log(d.login))"
```

**GitHub only (no Vercel needed):**
```powershell
npx ts-node src/scripts/publish-demo.ts --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo" --github-only
```

**Full pipeline:**
```powershell
npx ts-node src/scripts/publish-demo.ts --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo"
```

**Webhook server running:**
```powershell
npm run dev
# then visit http://localhost:3000/health
```

---

## Future phases (not built yet)

- Automated social media posting after publish
- Analytics tracking per demo site
- Multiple design templates
- Batch demo generation from an industry list
