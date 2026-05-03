# BrandLifters Automation

CLI pipeline for publishing BrandLifters demo websites — GitHub repo creation, Vercel deployment, screenshot capture, and website portfolio updates.

---

## Setup

### 1. Install dependencies

```powershell
cd C:\Users\abdul\brandlifters-material\brandlifters-automation
npm install
npx playwright install chromium
```

### 2. Configure environment variables

```powershell
copy .env.example .env
```

Fill in these values:

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens → needs `repo` scope |
| `GITHUB_OWNER` | `brandlifters` |
| `VERCEL_TOKEN` | Vercel dashboard → Settings → Tokens |
| `VERCEL_TEAM_ID` | Leave blank (personal account) |
| `WEBSITE_REPO_PATH` | Absolute path to `brandlifters-website` — defaults to the sibling folder |

The remaining variables (`BRANDLIFTERS_*`) have correct defaults and don't need to be changed unless your folder layout is different.

### 3. SSH setup

All repos under `brandlifters-material/` push to GitHub using the `github-brandlifters` SSH alias.
Your `~/.ssh/config` must include:

```
Host github-brandlifters
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_brandlifters
```

The key `id_brandlifters` must be added to the `brandlifters` GitHub account.
See [docs/git-account-targeting.md](docs/git-account-targeting.md) for full setup.

---

## Commands

See [COMMANDS.md](COMMANDS.md) for the full reference. Quick summary:

| Command | Use it when… |
|---|---|
| `npm run publish-demo -- --path "..."` | Deploying a brand-new demo for the first time |
| `npm run update-demo -- --path "..."` | Pushing changes to an already-deployed demo |
| `npm run push-website` | Pushing edits to the brandlifters website |
| `npm run push-automation` | Pushing changes to this automation repo |
| `npm run configure-repo -- --path "..."` | Fixing git identity on any repo |

---

## demo.config.json

Every demo folder must contain this file. Example:

```json
{
  "name": "barber-demo",
  "industry": "Beauty",
  "title": "Northline Barbers",
  "description": "A premium barber shop demo website.",
  "features": ["Per-barber booking", "Service & pricing menu", "Hours & directions"],
  "tags": ["barber", "local business"],
  "primaryColor": "#111111",
  "accentFrom": "#115e5b",
  "accentTo": "#0fb5b1",
  "repoName": "demo-barber-shop",
  "vercelProjectName": "demo-barber-shop",
  "localPath": "C:/Users/abdul/brandlifters-material/brandlifters-demo/barber-demo",
  "previewUrl": ""
}
```

See `demo.config.example.json` and `CODEBASE.md` for field descriptions.

---

## Folder layout

```
brandlifters-material/
├── brandlifters-automation/    ← run all commands from here
│   ├── src/
│   ├── .env
│   ├── COMMANDS.md
│   ├── CODEBASE.md
│   └── package.json
├── brandlifters-website/       ← updated automatically by the pipeline
│   └── src/lib/data/demos.json
└── brandlifters-demo/
    ├── barber-demo/
    │   ├── demo.config.json
    │   └── index.html / ...
    └── restaurant-demo/
        ├── demo.config.json
        └── ...
```

---

## Troubleshooting

**`Permission denied (publickey)` on git push**
The SSH alias `github-brandlifters` is missing or the key isn't added to GitHub. See `docs/git-account-targeting.md`.

**`demos.json not found`**
Set `WEBSITE_REPO_PATH` in `.env` to the absolute path of `brandlifters-website`.

**Vercel deployment stuck**
The script retries for up to 10 minutes. If it times out, the project is already created — re-run `update-demo` (not `publish-demo`) to retry.

**`demo.config.json not found`**
`--path` must point to the folder that *contains* the file, not to the file itself.
