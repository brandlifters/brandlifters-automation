# BrandLifters Automation — Command Reference

All commands are run from inside the `brandlifters-automation` directory.

---

## Quick Reference

### Demo sites (BrandLifters portfolio)

| Goal | Command |
|---|---|
| Publish a brand-new demo (full pipeline) | `npm run publish-demo -- --path "C:\...\demo-name"` |
| Push code updates to an existing demo | `npm run update-demo -- --path "C:\...\demo-name"` |
| Push code updates only (no screenshot) | `npm run update-demo -- --path "C:\...\demo-name" --code-only` |

### Customer websites

| Goal | Command |
|---|---|
| First deploy — GitHub + Vercel, wait for live | `npm run deploy-customer-site -- --path "C:\...\site-name"` |
| Push code updates to an existing customer site | `npm run push-customer-site -- --path "C:\...\site-name"` |
| Get Vercel URL + screenshot + add to portfolio | `npm run finalize-customer-site -- --path "C:\...\site-name"` |

### Shared

| Goal | Command |
|---|---|
| Push changes to the brandlifters website | `npm run push-website` |
| Push changes to this automation repo | `npm run push-automation` |
| Fix git identity on any repo | `npm run configure-repo -- --path "C:\...\repo"` |

---

## publish-demo

**When to use:** A brand-new demo that has never been deployed. Creates the GitHub repo, links Vercel, deploys, screenshots, and adds it to the website portfolio.

```powershell
npm run publish-demo -- --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo"
```

**Flags:**

| Flag | Effect |
|---|---|
| `--path <dir>` | Path to the demo folder containing `demo.config.json` |
| `--github-only` | Stop after pushing to GitHub (skips Vercel, screenshot, portfolio) |
| `--no-portfolio` | Stop after Vercel deployment (skips screenshot and portfolio update) |

**Steps it runs:**
1. Load and validate `demo.config.json`
2. Create GitHub repo (skipped if it already exists)
3. Push demo code to GitHub via SSH
4. Create Vercel project linked to the repo (skipped if it already exists)
5. Trigger deployment (only if Vercel project was just created) and wait until live
6. Capture full-page screenshot, generate 1200×675 WebP thumbnail
7. Push thumbnail to demo repo, update `demos.json` on the website, push website

**Example — GitHub only (Vercel not configured yet):**
```powershell
npm run publish-demo -- --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo" --github-only
```

**Example — Deploy to Vercel but skip portfolio:**
```powershell
npm run publish-demo -- --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo" --no-portfolio
```

---

## update-demo

**When to use:** A demo that already exists on GitHub + Vercel and you made code changes to it. Pushes the updated code, waits for Vercel to redeploy, and refreshes the thumbnail + website portfolio entry.

```powershell
npm run update-demo -- --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo"
```

**Flags:**

| Flag | Effect |
|---|---|
| `--path <dir>` | Path to the demo folder |
| `--code-only` | Push code and wait for deploy, but skip screenshot + portfolio update |

**Steps it runs:**
1. Verify Vercel project exists (errors if not — use `publish-demo` instead)
2. Push updated code to GitHub
3. Wait for Vercel to finish redeploying
4. Capture new screenshot, generate new thumbnail
5. Push thumbnail, update website portfolio entry, push website

**Example — Just push code changes, no screenshot refresh:**
```powershell
npm run update-demo -- --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo" --code-only
```

---

## deploy-customer-site

**When to use:** A brand-new customer website that has never been deployed. Creates the GitHub repo, links Vercel, and waits for the site to go live. Does not take a screenshot or update the portfolio — run `finalize-customer-site` once you've reviewed the live site.

Site directories must contain a `site.config.json` (same fields as `demo.config.json`).

```powershell
npm run deploy-customer-site -- --path "C:\Users\abdul\brandlifters-material\customer-websites\acme-plumbing"
```

**Steps it runs:**
1. Load and validate `site.config.json`
2. Create GitHub repo (skipped if it already exists)
3. Push site code to GitHub
4. Create Vercel project linked to the repo (skipped if it already exists)
5. Trigger deployment (only if Vercel project was just created) and wait until live

---

## push-customer-site

**When to use:** A customer site that is already live on GitHub + Vercel and you've made code changes. Pushes the updated code — Vercel picks it up automatically via the GitHub integration. No polling, no empty commit.

```powershell
npm run push-customer-site -- --path "C:\Users\abdul\brandlifters-material\customer-websites\acme-plumbing"
```

**Steps it runs:**
1. Load `site.config.json`
2. Push updated code to GitHub (Vercel redeploys automatically)

---

## finalize-customer-site

**When to use:** After `deploy-customer-site` (once you've reviewed the live site), or any time you want to refresh the portfolio card for a customer site. Fetches the current production URL from Vercel, captures a screenshot, generates a thumbnail, and adds or updates the entry in the brandlifters-website portfolio.

```powershell
npm run finalize-customer-site -- --path "C:\Users\abdul\brandlifters-material\customer-websites\acme-plumbing"
```

**Steps it runs:**
1. Load `site.config.json`
2. Fetch current production URL from Vercel (no new deployment triggered)
3. Capture full-page screenshot, generate 1200×675 WebP thumbnail
4. Push thumbnail to site repo, update `demos.json` on the website, push website

---

## push-website

**When to use:** You made direct changes to the `brandlifters-website` repo (pages, components, styles, data files, etc.) and want to push them to GitHub, which triggers a Vercel redeploy of the website.

```powershell
npm run push-website
```

**With a custom commit message:**
```powershell
npm run push-website -- --message "feat: update homepage hero section"
```

**Default commit message:** `chore: update website`

---

## push-automation

**When to use:** You made changes to this automation repo (scripts, services, configs) and want to push them to GitHub.

```powershell
npm run push-automation
```

**With a custom commit message:**
```powershell
npm run push-automation -- --message "fix: improve Vercel URL resolution"
```

**Default commit message:** `chore: update automation`

---

## configure-repo

**When to use:** Any repo under `brandlifters-material` that needs its git identity and SSH remote corrected. Run this if you cloned a repo manually, scaffolded one outside the pipeline, or if `git push` is failing with a wrong account.

```powershell
npm run configure-repo -- --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\barber-demo"
```

Without `--path`, it configures the current directory:
```powershell
cd C:\Users\abdul\brandlifters-material\brandlifters-website
npm run configure-repo
```

**What it sets (locally, only for that repo):**
- `git config user.name "brandlifters"`
- `git config user.email "brandliftersseo@gmail.com"`
- `git remote origin git@github-brandlifters:brandlifters/<repo>.git`

It does NOT commit, push, or modify any files.

---

## Common scenarios

### New demo, full run
```powershell
npm run publish-demo -- --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\restaurant-demo"
```

### Already deployed, code change only
```powershell
npm run update-demo -- --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\restaurant-demo" --code-only
```

### Already deployed, refresh everything (code + screenshot + portfolio)
```powershell
npm run update-demo -- --path "C:\Users\abdul\brandlifters-material\brandlifters-demo\restaurant-demo"
```

### Website edit (e.g. changed a page or component)
```powershell
npm run push-website -- --message "feat: add new service section"
```

### Updated this automation script
```powershell
npm run push-automation -- --message "fix: deploy trigger logic"
```

---

## Notes

- All commands must be run from `C:\Users\abdul\brandlifters-material\brandlifters-automation`
- Demo folders must contain a `demo.config.json` — see `demo.config.example.json` for the format
- The SSH alias `github-brandlifters` must be configured in `~/.ssh/config` (see README)
- Run `npm install` once after cloning, and `npx playwright install chromium` for screenshots
