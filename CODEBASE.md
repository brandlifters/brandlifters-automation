# BrandLifters Automation — Codebase Reference

This file is the authoritative guide to the repo's structure and purpose.
It is parsed by Claude Code at the start of each session instead of walking the entire repo.

---

## What this repo does

`brandlifters-automation` is a CLI automation toolchain that manages the full lifecycle of BrandLifters demo websites:

- Creates GitHub repos and pushes demo code via SSH
- Creates Vercel projects linked to those repos and deploys them
- Captures screenshots and generates WebP thumbnails
- Updates the `brandlifters-website` portfolio (`demos.json`) and pushes it to trigger a website redeploy

Everything runs locally from the command line — no webhook server, no external listeners.

---

## Folder layout

```
brandlifters-automation/
├── src/
│   ├── config/
│   │   └── env.ts                    # Loads .env and validates all required vars via Zod
│   ├── types/
│   │   └── index.ts                  # All shared TypeScript interfaces
│   ├── utils/
│   │   ├── logger.ts                 # Winston logger (console + file output)
│   │   ├── config-loader.ts          # Reads + validates demo.config.json from a demo folder
│   │   └── git-identity.ts           # Applies BrandLifters git identity to any repo
│   ├── services/
│   │   ├── github.ts                 # GitHub API (Octokit) + git push via SSH
│   │   ├── vercel.ts                 # Vercel API — project creation + deployment polling
│   │   ├── screenshot.ts             # Playwright — captures full-page PNG
│   │   ├── thumbnail.ts              # Sharp — resizes PNG to 1200×675 WebP
│   │   ├── website-portfolio.ts      # Writes demos.json to website repo + pushes
│   │   └── website-portfolio.types.ts  # LiveDemo interface (mirrors website's type)
│   └── scripts/
│       ├── publish-demo.ts           # Full pipeline for a brand-new demo (7 steps)
│       ├── update-demo.ts            # Updates an existing demo (code push + optional refresh)
│       ├── push-website.ts           # Commits + pushes the brandlifters-website repo
│       ├── push-automation.ts        # Commits + pushes this automation repo
│       └── configure-repo.ts         # Applies git identity to any existing repo manually
├── docs/
│   └── git-account-targeting.md     # How multi-account SSH is set up
├── output/                           # Generated files — gitignored
│   ├── screenshots/                  # Full-page PNGs from Playwright
│   ├── thumbnails/                   # WebP thumbnails (1200×675)
│   ├── snapshots/                    # Debug JSON written on pipeline failure
│   └── logs/                         # Winston log files
├── .env                              # Secrets — never committed
├── .env.example                      # Template to copy to .env
├── demo.config.example.json          # Template for a demo site's config file
├── package.json                      # Scripts + dependencies
├── tsconfig.json                     # TypeScript config (strict, ES2020, commonjs)
├── COMMANDS.md                       # Human-readable command reference
├── CODEBASE.md                       # This file
└── README.md                         # Setup and overview
```

---

## Environment variables (.env)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GITHUB_TOKEN` | yes | — | Octokit REST API authentication (repo creation) |
| `GITHUB_OWNER` | yes | — | GitHub org/username (e.g. `brandlifters`) |
| `VERCEL_TOKEN` | yes | — | Vercel REST API token |
| `VERCEL_TEAM_ID` | no | `` | Vercel team ID (blank = personal account) |
| `SCREENSHOT_OUTPUT_DIR` | no | `./output/screenshots` | Where PNGs are saved |
| `THUMBNAIL_OUTPUT_DIR` | no | `./output/thumbnails` | Where WebPs are saved |
| `WEBSITE_REPO_PATH` | no | `C:/Users/abdul/brandlifters-material/brandlifters-website` | Absolute path to website repo |
| `BRANDLIFTERS_PARENT_DIR` | no | `C:/Users/abdul/brandlifters-material` | Scopes BrandLifters repo detection |
| `BRANDLIFTERS_SSH_ALIAS` | no | `github-brandlifters` | SSH host alias in `~/.ssh/config` |
| `BRANDLIFTERS_GITHUB_ORG` | no | `brandlifters` | GitHub org in SSH remote URLs |
| `BRANDLIFTERS_GIT_NAME` | no | `brandlifters` | Local git `user.name` for all BL repos |
| `BRANDLIFTERS_GIT_EMAIL` | no | `brandliftersseo@gmail.com` | Local git `user.email` for all BL repos |

---

## demo.config.json fields

Every demo site folder must contain a `demo.config.json` file.

| Field | Required | Description |
|---|---|---|
| `name` | yes | Unique kebab-case ID — used as portfolio entry ID and filename stem |
| `industry` | yes | Must match a valid `Industry` value in the website (e.g. `Beauty`, `Dental Clinic`) |
| `title` | yes | Business display name shown on the portfolio card |
| `description` | yes | Short blurb for the portfolio card |
| `repoName` | yes | GitHub repo name — lowercase alphanumeric + hyphens |
| `vercelProjectName` | yes | Vercel project name — must match `repoName` |
| `localPath` | yes | Absolute path to the demo folder on disk |
| `previewUrl` | yes | Leave empty `""` — pipeline fills this in after deployment |
| `features` | no | Array of bullet points shown on the portfolio card |
| `tags` | no | Informational tags (not shown in UI currently) |
| `primaryColor` | no | Brand hex colour (informational only) |
| `accentFrom` | no | Gradient start hex for card header (default `#0d8e8b`) |
| `accentTo` | no | Gradient end hex for card header (default `#22d3ee`) |

---

## Key source files in detail

### src/config/env.ts
Loads `.env` via `dotenv` and runs Zod validation. Throws a clear error if any required variable is missing. All services import from `env` instead of reading `process.env` directly.

### src/types/index.ts
Shared interfaces: `DemoConfig`, `GitHubRepoResult`, `VercelProjectResult`, `ScreenshotResult`, `PublishPipelineState`.

### src/utils/config-loader.ts
`loadDemoConfig(demoDir)` — reads and Zod-validates `demo.config.json` from a given directory. Throws with a clear message if the file is missing or invalid.

### src/utils/git-identity.ts
`configureGitIdentity(repoPath, repoName?)` — sets local `git config user.name/email` and the SSH origin remote for any repo under `BRANDLIFTERS_PARENT_DIR`. Idempotent. Called automatically before every `git push` in `github.ts`.

`isBrandLiftersRepo(path)` — returns `true` if the path is inside `BRANDLIFTERS_PARENT_DIR`.

### src/utils/logger.ts
Winston logger. Logs to console (colored) and `./output/logs/automation.log`. Level controlled by `LOG_LEVEL` env var (default: `info`).

### src/services/github.ts
- `ensureGitHubRepo(config)` — creates the repo via Octokit if it doesn't exist; returns metadata including `alreadyExisted`
- `pushToGitHub(config, repoResult)` — `git init`, configure identity, stage all, commit (amend if commits exist), force-push
- `triggerDeployCommit(config)` — pushes an empty commit; **only call this when the Vercel project was just created** — existing projects are already triggered by the code push
- `uploadThumbnailToGitHub(config, thumbnailPath)` — copies WebP to `.brandlifters/thumbnail.webp` in the demo repo, commits, pushes; returns the `raw.githubusercontent.com` URL
- `pushWebsiteRepo(websitePath, message)` — stages all, commits if there are changes, pushes the website repo
- `pushAutomationRepo(automationPath, message)` — same for the automation repo

### src/services/vercel.ts
- `ensureVercelProject(config, githubOwner)` — creates Vercel project linked to GitHub repo if it doesn't exist; returns `alreadyExisted`
- `waitForDeployment(projectId, projectName, since, maxWaitMs?)` — polls `/v6/deployments` until a deployment after `since` appears, then polls `/v13/deployments/:id` until READY; resolves production URL in this order: deployment alias → project domains API → fallback `projectName.vercel.app`

### src/services/screenshot.ts
`captureScreenshot(url, siteName)` — launches Chromium (headless), navigates to URL, waits for `networkidle` + 2s, takes full-page screenshot at 1440×900. Returns absolute PNG path.

### src/services/thumbnail.ts
`generateThumbnail(screenshotPath, siteName)` — uses Sharp to resize PNG to 1200×675 (cover, top-aligned), WebP quality 85. Returns absolute WebP path.

### src/services/website-portfolio.ts
`publishToWebsitePortfolio(demo)` — reads `brandlifters-website/src/lib/data/demos.json`, inserts or updates the entry, writes the file, commits and pushes. Triggers Vercel to redeploy the website.

### src/services/website-portfolio.types.ts
`LiveDemo` interface — mirrors the type in `brandlifters-website/src/lib/data/portfolio.ts`. Keep in sync if fields change.

---

## Scripts in detail

### publish-demo.ts
Full 7-step pipeline for a **new** demo. Smart deploy trigger — only pushes an empty commit if the Vercel project was just created; existing projects are triggered by the normal code push.

Flags: `--path`, `--github-only`, `--no-portfolio`

### update-demo.ts
For **existing** demos. Verifies Vercel project exists before starting (errors if not — use `publish-demo` instead). Pushes code, waits for deploy, optionally refreshes screenshot + portfolio.

Flags: `--path`, `--code-only`

### push-website.ts
Stages + commits all pending changes in the website repo and pushes to GitHub.

Flags: `--message`

### push-automation.ts
Stages + commits all pending changes in this repo and pushes to GitHub.

Flags: `--message`

### configure-repo.ts
Manual/retroactive git identity fixer. Sets `user.name`, `user.email`, and SSH `origin` remote for any repo under `BRANDLIFTERS_PARENT_DIR`. Refuses paths outside that directory. Does NOT push or modify files.

Flags: `--path`

---

## Pipeline flow diagrams

### publish-demo (new demo)
```
Load config → Ensure GitHub repo → Push code → Ensure Vercel project
  → [if new project] trigger empty commit → Poll until READY
  → Screenshot → Thumbnail → Upload thumbnail → Update demos.json → Push website
```

### update-demo (existing demo)
```
Load config → Verify Vercel project exists → Push code → Poll until READY
  → [unless --code-only] Screenshot → Thumbnail → Upload thumbnail → Update demos.json → Push website
```

---

## Git / SSH setup

All repos under `brandlifters-material/` use the `github-brandlifters` SSH alias.
SSH config at `~/.ssh/config` must contain:
```
Host github-brandlifters
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_brandlifters
```

The key `~/.ssh/id_brandlifters` must be added to the `brandlifters` GitHub account.
See `docs/git-account-targeting.md` for full setup instructions.

---

## Sibling repos

These repos live alongside `brandlifters-automation` under `brandlifters-material/`:

| Repo | Purpose |
|---|---|
| `brandlifters-website` | The custom Next.js website. Portfolio reads `src/lib/data/demos.json`. |
| `brandlifters-demo/` | Not a single repo — contains sub-folders, each a separate demo site with its own `demo.config.json`. |

The automation pipeline writes to both of the above — it never reads from them except to check existence.
