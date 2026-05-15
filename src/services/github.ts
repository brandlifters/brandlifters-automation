/**
 * GitHub Service
 *
 * AUTH SPLIT:
 *   - Octokit API calls → GITHUB_TOKEN (REST API)
 *   - git push          → SSH alias (configured by git-identity.ts)
 *   The token is never embedded in a remote URL.
 */

import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { configureGitIdentity, buildSshRemoteUrl } from '../utils/git-identity';
import { DemoConfig, GitHubRepoResult } from '../types';

function getOctokit(): Octokit {
  return new Octokit({ auth: env.GITHUB_TOKEN });
}

async function getAuthenticatedLogin(octokit: Octokit): Promise<string> {
  const { data } = await octokit.users.getAuthenticated();
  return data.login;
}

// ─── Repo Management ───────────────────────────────────────────────────────────

/**
 * Creates the GitHub repo if it doesn't already exist.
 * Always returns repo metadata — safe to call multiple times.
 */
export async function ensureGitHubRepo(config: DemoConfig, isPrivate = false): Promise<GitHubRepoResult> {
  const octokit = getOctokit();
  const { repoName } = config;

  logger.info(`[GitHub] Checking for repo: ${env.GITHUB_OWNER}/${repoName}`);

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
    if ((err as { status?: number }).status !== 404) throw err;
  }

  logger.info(`[GitHub] Creating new repo: ${repoName}`);

  const authenticatedLogin = await getAuthenticatedLogin(octokit);
  const isPersonalAccount =
    authenticatedLogin.toLowerCase() === env.GITHUB_OWNER.toLowerCase();

  logger.info(
    `[GitHub] Token owner: ${authenticatedLogin} | Target owner: ${env.GITHUB_OWNER} | ` +
      `Using: ${isPersonalAccount ? 'createForAuthenticatedUser' : 'createInOrg'}`
  );

  const repoPayload = {
    name: repoName,
    description: `BrandLifters demo — ${config.industry}: ${config.title}`,
    private: isPrivate,
    auto_init: false,
  };

  let data: { name: string; html_url: string; clone_url: string };

  if (isPersonalAccount) {
    ({ data } = await octokit.repos.createForAuthenticatedUser(repoPayload));
  } else {
    ({ data } = await octokit.repos.createInOrg({
      org: env.GITHUB_OWNER,
      ...repoPayload,
    }));
  }

  logger.info(`[GitHub] Repo created: ${data.html_url}`);
  return {
    repoName: data.name,
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
    alreadyExisted: false,
  };
}

// ─── Push Demo Code ────────────────────────────────────────────────────────────

/**
 * Stages all files, commits, and force-pushes the demo to GitHub via SSH.
 * Force-push is intentional — demo repos are non-collaborative.
 */
export async function pushToGitHub(
  config: DemoConfig,
  repoResult: GitHubRepoResult
): Promise<void> {
  const localPath = path.resolve(config.localPath);

  logger.info(`[GitHub] Preparing push for: ${repoResult.repoName}`);

  runGit(localPath, 'init -b main');

  const identity = configureGitIdentity(localPath, repoResult.repoName);
  logger.info(`[GitHub] Remote: ${identity.remoteUrl}`);

  runGit(localPath, 'add -A');

  const hasCommits = hasExistingCommits(localPath);
  if (hasCommits) {
    runGit(
      localPath,
      `commit --allow-empty --amend -m "chore: update demo site [${config.industry}]"`
    );
  } else {
    runGit(localPath, `commit -m "feat: initial demo site [${config.industry}]"`);
  }

  runGit(localPath, 'push -u origin main --force');

  logger.info(`[GitHub] Push complete → ${identity.remoteUrl}`);
}

// ─── Deploy Trigger ────────────────────────────────────────────────────────────

/**
 * Pushes an empty commit to trigger the first Vercel deployment.
 *
 * Only call this when the Vercel project was just created (repoResult.alreadyExisted === false).
 * On existing projects Vercel already triggered from the pushToGitHub call above.
 */
export function triggerDeployCommit(config: DemoConfig): void {
  const localPath = path.resolve(config.localPath);

  logger.info(`[GitHub] Pushing empty commit to trigger Vercel deployment...`);

  runGit(
    localPath,
    `commit --allow-empty -m "chore: trigger vercel deploy [${config.industry}]"`
  );
  runGit(localPath, 'push origin main');

  logger.info(`[GitHub] Trigger commit pushed`);
}

// ─── Thumbnail Hosting ─────────────────────────────────────────────────────────

/**
 * Copies the generated thumbnail into the demo repo under `.brandlifters/`,
 * commits, and pushes. Returns the raw.githubusercontent.com URL.
 */
export function uploadThumbnailToGitHub(
  config: DemoConfig,
  thumbnailPath: string
): string {
  const localPath = path.resolve(config.localPath);
  const destDir = path.join(localPath, '.brandlifters');
  const destFile = path.join(destDir, 'thumbnail.webp');

  logger.info(`[GitHub] Copying thumbnail to demo repo...`);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(thumbnailPath, destFile);

  runGit(localPath, 'add .brandlifters/thumbnail.webp');
  runGit(
    localPath,
    `commit --allow-empty -m "chore: add portfolio thumbnail [${config.industry}]"`
  );
  runGit(localPath, 'push origin main');

  const rawUrl = `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${config.repoName}/main/.brandlifters/thumbnail.webp`;
  logger.info(`[GitHub] Thumbnail pushed → ${rawUrl}`);
  return rawUrl;
}

// ─── Push Website Repo ─────────────────────────────────────────────────────────

/**
 * Commits all pending changes in the brandlifters-website repo and pushes.
 * Used by the push-website command to publish website edits independently.
 */
export function pushWebsiteRepo(websitePath: string, message: string): void {
  logger.info(`[GitHub] Pushing website repo: ${websitePath}`);

  configureGitIdentity(websitePath, 'brandlifters-website');

  runGit(websitePath, 'add -A');

  const status = execSync('git status --porcelain', { cwd: websitePath }).toString().trim();
  if (!status) {
    logger.info('[GitHub] Website repo has no changes to push.');
    return;
  }

  runGit(websitePath, `commit -m "${message}"`);
  runGit(websitePath, 'push origin main');

  logger.info(`[GitHub] Website repo pushed.`);
}

// ─── Push Automation Repo ──────────────────────────────────────────────────────

/**
 * Commits all pending changes in the brandlifters-automation repo and pushes.
 * Used by the push-automation command.
 */
export function pushAutomationRepo(automationPath: string, message: string): void {
  logger.info(`[GitHub] Pushing automation repo: ${automationPath}`);

  configureGitIdentity(automationPath, 'brandlifters-automation');

  runGit(automationPath, 'add -A');

  const status = execSync('git status --porcelain', { cwd: automationPath }).toString().trim();
  if (!status) {
    logger.info('[GitHub] Automation repo has no changes to push.');
    return;
  }

  runGit(automationPath, `commit -m "${message}"`);
  runGit(automationPath, 'push origin main');

  logger.info(`[GitHub] Automation repo pushed.`);
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

// Re-export for scripts that only need the URL builder
export { buildSshRemoteUrl };
