# Git Account Targeting — BrandLifters

This document explains how the automation system ensures every repo under
`brandlifters-material` is committed and pushed using the correct GitHub
account, SSH key, and git identity.

---

## The problem

Git is global by default. Without explicit configuration, every repo on your
machine uses whatever `user.name`, `user.email`, and remote URL you set last.
When you run two separate GitHub accounts (e.g. a personal account and a
business account), commits end up under the wrong author and pushes fail or
land on the wrong account.

---

## How this system solves it

### 1. SSH host alias (one-time manual setup — already done)

Your `~/.ssh/config` contains an alias entry like:

```
Host github-brandlifters
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_brandlifters
```

This tells git: "when I connect to `github-brandlifters`, use the BrandLifters
private key." The alias is what makes multi-account SSH work on one machine.

### 2. Folder-scoped detection

Every git repo under `brandlifters-material/` is treated as a BrandLifters repo.
The detection logic lives in [src/utils/git-identity.ts](../src/utils/git-identity.ts):

```typescript
isBrandLiftersRepo(repoPath)
// Returns true if repoPath is inside BRANDLIFTERS_PARENT_DIR
```

Detection is path-normalised and case-insensitive (safe on Windows).

### 3. Automatic identity application

`configureGitIdentity(repoPath, repoName)` applies three settings in one call:

| Setting | Value | Scope |
|---|---|---|
| `git config user.name` | `brandlifters` | Local (this repo only) |
| `git config user.email` | `brandliftersseo@gmail.com` | Local (this repo only) |
| `git remote origin` | `git@github-brandlifters:brandlifters/<repo>.git` | Local (this repo only) |

**Local scope** means these settings only apply inside the repo's `.git/config`.
Your global `~/.gitconfig` is never touched.

### 4. Where it is called automatically

Inside `pushToGitHub()` in [src/services/github.ts](../src/services/github.ts),
the call order is:

```
git init
configureGitIdentity()   ← sets name, email, AND remote before the commit
git add -A
git commit               ← now carries the correct author identity
git push                 ← uses SSH alias, not a token-embedded HTTPS URL
```

This means every time you run `npm run publish-demo`, the repo is re-configured
even if something was accidentally changed since the last run. The function is
idempotent — running it on an already-correct repo changes nothing.

### 5. The SSH remote URL format

All BrandLifters repos use this remote URL pattern:

```
git@github-brandlifters:brandlifters/<repoName>.git
```

This is fundamentally different from the default GitHub HTTPS URL:

```
https://github.com/brandlifters/<repoName>.git  ← NOT used
```

The HTTPS URL would require embedding a token in the URL, which is a security
risk and ties the URL to a credential. The SSH alias approach is cleaner.

---

## Configuration

All targeting values are in `.env` (never hardcoded):

| Variable | Purpose | Default |
|---|---|---|
| `BRANDLIFTERS_PARENT_DIR` | Folder path that scopes BrandLifters repos | `C:/Users/abdul/brandlifters-material` |
| `BRANDLIFTERS_SSH_ALIAS` | SSH host alias from `~/.ssh/config` | `github-brandlifters` |
| `BRANDLIFTERS_GITHUB_ORG` | GitHub org/username in remote path | `brandlifters` |
| `BRANDLIFTERS_GIT_NAME` | Local git `user.name` | `brandlifters` |
| `BRANDLIFTERS_GIT_EMAIL` | Local git `user.email` | `brandliftersseo@gmail.com` |

To adapt for a different machine, account, or folder structure, update `.env` only.
No code changes needed.

---

## Manual / retroactive use

For repos that already exist (cloned, scaffolded outside the pipeline, etc.):

```powershell
# From inside the repo directory
npm run configure-repo

# Or pointing to any repo path
npm run configure-repo -- --path "C:/Users/abdul/brandlifters-material/some-repo"
```

This applies the same identity settings as the automatic pipeline.
It does NOT commit or push anything.

Verify the result:

```powershell
git remote -v
git config user.name
git config user.email
```

Expected output:

```
origin  git@github-brandlifters:brandlifters/some-repo.git (fetch)
origin  git@github-brandlifters:brandlifters/some-repo.git (push)
brandlifters
brandliftersseo@gmail.com
```

---

## What is NOT affected

- Any repo outside `brandlifters-material/` — the script refuses to run on them
- Your global `~/.gitconfig` — local config is used exclusively
- Other git remotes (`upstream`, etc.) — only `origin` is managed
- The Octokit REST API calls — these still use `GITHUB_TOKEN` (separate from SSH)

---

## File map

| File | Role |
|---|---|
| [src/utils/git-identity.ts](../src/utils/git-identity.ts) | Core utility — all targeting logic lives here |
| [src/services/github.ts](../src/services/github.ts) | Calls `configureGitIdentity` before every commit |
| [src/scripts/configure-repo.ts](../src/scripts/configure-repo.ts) | CLI for manual/retroactive use |
| [src/config/env.ts](../src/config/env.ts) | Declares and validates all targeting env vars |
| [.env.example](../.env.example) | Documents all required values |
