/**
 * GitHub Service
 *
 * Handles:
 *   - Creating a public GitHub repo for a demo site (if it doesn't exist)
 *   - Initialising git in the local demo directory
 *   - Committing and pushing the demo code to GitHub
 *
 * Uses @octokit/rest for API calls and child_process for git commands.
 */

import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { DemoConfig, GitHubRepoResult } from '../types';

function getOctokit(): Octokit {
  return new Octokit({ auth: env.GITHUB_TOKEN });
}

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
    auto_init: false, // We will push our own initial commit
  });

  logger.info(`[GitHub] Repo created: ${data.html_url}`);
  return {
    repoName: data.name,
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
    alreadyExisted: false,
  };
}

/**
 * Pushes the local demo directory to the GitHub repo.
 *
 * - Initialises git if not already initialised
 * - Stages all files
 * - Creates a commit (or amends if already initialised)
 * - Force-pushes to main (demo sites are not collaborative — force push is safe)
 */
export async function pushToGitHub(
  config: DemoConfig,
  repoResult: GitHubRepoResult
): Promise<void> {
  const localPath = path.resolve(config.localPath);

  logger.info(`[GitHub] Pushing ${localPath} → ${repoResult.cloneUrl}`);

  // Build the authenticated remote URL so git push works without prompts
  const remoteUrl = buildAuthenticatedRemoteUrl(repoResult.cloneUrl);

  runGit(localPath, 'init -b main');
  runGit(localPath, 'add -A');

  // Git requires at least one commit to push — check if HEAD exists
  const hasCommits = hasExistingCommits(localPath);
  if (hasCommits) {
    // Overwrite last commit so re-runs don't pile up pointless history
    runGit(
      localPath,
      `commit --allow-empty --amend -m "chore: update demo site [${config.industry}]"`
    );
  } else {
    runGit(localPath, `commit -m "feat: initial demo site [${config.industry}]"`);
  }

  // Set/update the remote
  const remoteExists = gitRemoteExists(localPath, 'origin');
  if (remoteExists) {
    runGit(localPath, `remote set-url origin ${remoteUrl}`);
  } else {
    runGit(localPath, `remote add origin ${remoteUrl}`);
  }

  // Force push — safe for demo sites, no collaborative branch protection needed
  runGit(localPath, 'push -u origin main --force');

  logger.info(`[GitHub] Push complete`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildAuthenticatedRemoteUrl(cloneUrl: string): string {
  // Convert https://github.com/owner/repo.git
  //      → https://<token>@github.com/owner/repo.git
  return cloneUrl.replace('https://', `https://${env.GITHUB_TOKEN}@`);
}

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

function gitRemoteExists(cwd: string, name: string): boolean {
  try {
    execSync(`git remote get-url ${name}`, { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
