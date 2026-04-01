/**
 * GitHub Service
 *
 * Handles:
 *   - Creating a public GitHub repo via the Octokit REST API
 *   - Initialising git in the local demo directory
 *   - Committing and pushing via SSH using the BrandLifters account alias
 *
 * AUTH SPLIT (important):
 *   - Octokit API calls  → GITHUB_TOKEN (REST API authentication)
 *   - git push           → SSH alias    (configured by git-identity.ts)
 *   These are intentionally separate. The token is never embedded in a remote URL.
 */

import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { configureGitIdentity } from '../utils/git-identity';
import { DemoConfig, GitHubRepoResult } from '../types';

function getOctokit(): Octokit {
  return new Octokit({ auth: env.GITHUB_TOKEN });
}

// ─── Repo Management ───────────────────────────────────────────────────────────

/**
 * Creates the GitHub repo if it doesn't already exist.
 * Always returns the repo metadata — safe to call multiple times.
 */
export async function ensureGitHubRepo(config: DemoConfig): Promise<GitHubRepoResult> {
  const octokit = getOctokit();
  const { repoName } = config;

  logger.info(`[GitHub] Checking for repo: ${env.GITHUB_OWNER}/${repoName}`);

  // Try to fetch the existing repo first
  try {
    const { data } = await octokit.repos.get({
      owner: env.GITHUB_OWNER,
      repo: repoName,
    });

    logger.info(`[GitHub] Repo already exists: ${data.html_url}`);
    return {
      repoName: data.name,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      alreadyExisted: true,
    };
  } catch (err: unknown) {
    // 404 means the repo doesn't exist yet — create it
    if ((err as { status?: number }).status !== 404) {
      throw err;
    }
  }

  logger.info(`[GitHub] Creating new repo: ${repoName}`);
  const { data } = await octokit.repos.createForAuthenticatedUser({
    name: repoName,
    description: `BrandLifters demo — ${config.industry}: ${config.title}`,
    private: false,
    auto_init: false, // We push our own initial commit
  });

  logger.info(`[GitHub] Repo created: ${data.html_url}`);
  return {
    repoName: data.name,
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
    alreadyExisted: false,
  };
}

// ─── Push ──────────────────────────────────────────────────────────────────────

/**
 * Pushes the local demo directory to GitHub using SSH.
 *
 * Order of operations matters:
 *   1. git init  — ensures .git exists before any config is written
 *   2. configureGitIdentity — sets user.name/email AND the SSH remote URL
 *                             (must happen before the commit so authorship is correct)
 *   3. git add + commit
 *   4. git push via the SSH alias (no token in URL)
 *
 * Force-push is used intentionally: demo sites are non-collaborative and
 * re-running publish-demo should always reflect the current local state.
 */
export async function pushToGitHub(
  config: DemoConfig,
  repoResult: GitHubRepoResult
): Promise<void> {
  const localPath = path.resolve(config.localPath);

  logger.info(`[GitHub] Preparing push for: ${repoResult.repoName}`);

  // ── Step 1: Ensure .git directory exists ──────────────────────────────────
  runGit(localPath, 'init -b main');

  // ── Step 2: Apply BrandLifters git identity ────────────────────────────────
  // This sets user.name, user.email, and the SSH origin remote — all in one call.
  // Must run BEFORE `git commit` so the commit carries the right author identity.
  const identity = configureGitIdentity(localPath, repoResult.repoName);
  logger.info(`[GitHub] Remote: ${identity.remoteUrl}`);

  // ── Step 3: Stage and commit ───────────────────────────────────────────────
  runGit(localPath, 'add -A');

  const hasCommits = hasExistingCommits(localPath);
  if (hasCommits) {
    // Amend — re-runs should not accumulate meaningless history on demo repos
    runGit(
      localPath,
      `commit --allow-empty --amend -m "chore: update demo site [${config.industry}]"`
    );
  } else {
    runGit(localPath, `commit -m "feat: initial demo site [${config.industry}]"`);
  }

  // ── Step 4: Push via SSH ───────────────────────────────────────────────────
  // The remote URL was already set to git@github-brandlifters:... by configureGitIdentity.
  // SSH resolves the alias → correct key → correct account. No token needed here.
  runGit(localPath, 'push -u origin main --force');

  logger.info(`[GitHub] Push complete → ${identity.remoteUrl}`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function runGit(cwd: string, args: string): void {
  const cmd = `git ${args}`;
  logger.debug(`[GitHub] $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'pipe' });
}

function hasExistingCommits(cwd: string): boolean {
  try {
    execSync('git rev-parse HEAD', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
