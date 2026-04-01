/**
 * Git Identity Utility — BrandLifters Account Targeting
 *
 * Single source of truth for how any repo under `brandlifters-material` gets
 * configured for the BrandLifters GitHub account.
 *
 * WHAT THIS MODULE DOES:
 *   - Detects whether a given repo path falls under the BrandLifters parent dir
 *   - Sets the local git user.name and user.email so commits carry the right identity
 *   - Sets (or corrects) the `origin` remote to the SSH alias URL format:
 *       git@github-brandlifters:brandlifters/<repoName>.git
 *
 * WHY SSH AND NOT HTTPS:
 *   A dedicated GitHub account with a separate SSH key is the standard approach
 *   for managing multiple accounts on one machine. The SSH host alias
 *   (`github-brandlifters`) is configured in ~/.ssh/config and maps to the
 *   correct key automatically. No token needs to be embedded in the URL.
 *
 * HOW IT IS USED:
 *   - Called automatically by the `pushToGitHub` function in github.ts
 *     before every git commit + push, so every pipeline run is self-correcting.
 *   - Called directly by the `configure-repo` CLI script for manual/retroactive use.
 *
 * CONFIGURATION:
 *   All values are driven by env vars (see env.ts). Nothing is hardcoded here.
 *   To adapt for a different folder or account, update .env — no code changes needed.
 */

import { execSync } from 'child_process';
import path from 'path';
import { env } from '../config/env';
import { logger } from './logger';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RepoIdentityStatus {
  repoPath: string;
  repoName: string;
  isBrandLiftersRepo: boolean;
  remoteUrl: string | null;
  remoteWasUpdated: boolean;
  identityWasSet: boolean;
}

// ─── Core API ──────────────────────────────────────────────────────────────────

/**
 * Checks whether a given path is inside the BrandLifters parent directory.
 *
 * Comparison is path-normalised and case-insensitive (Windows FS is case-insensitive).
 * Trailing slashes are stripped before comparison.
 *
 * @param repoPath  Absolute path to the repo root.
 */
export function isBrandLiftersRepo(repoPath: string): boolean {
  const normalised = normalisePath(path.resolve(repoPath));
  const parent = normalisePath(path.resolve(env.BRANDLIFTERS_PARENT_DIR));
  return normalised.startsWith(parent);
}

/**
 * Applies the full BrandLifters git identity to a repo:
 *   1. Sets local git config user.name + user.email
 *   2. Builds the correct SSH remote URL for the repo
 *   3. Creates `origin` if it doesn't exist, or corrects it if it points elsewhere
 *
 * This function is IDEMPOTENT — safe to call on a repo that is already correctly
 * configured. It compares the current remote URL before overwriting.
 *
 * @param repoPath  Absolute path to the repo root directory.
 * @param repoName  The GitHub repo name (e.g. "demo-dental-clinic").
 *                  If omitted, it is derived from the directory name.
 */
export function configureGitIdentity(
  repoPath: string,
  repoName?: string
): RepoIdentityStatus {
  const resolvedPath = path.resolve(repoPath);
  const derivedRepoName = repoName ?? deriveRepoName(resolvedPath);
  const targetRemoteUrl = buildSshRemoteUrl(derivedRepoName);

  logger.info(`[GitIdentity] Configuring repo: ${derivedRepoName}`);
  logger.info(`[GitIdentity] Path: ${resolvedPath}`);

  // ── 1. Set local git identity ──────────────────────────────────────────────
  // Local config overrides global config only for this repo.
  // This means personal repos outside this folder are not affected.
  runGit(resolvedPath, `config user.name "${env.BRANDLIFTERS_GIT_NAME}"`);
  runGit(resolvedPath, `config user.email "${env.BRANDLIFTERS_GIT_EMAIL}"`);

  logger.info(
    `[GitIdentity] Identity set: ${env.BRANDLIFTERS_GIT_NAME} <${env.BRANDLIFTERS_GIT_EMAIL}>`
  );

  // ── 2. Set the origin remote ───────────────────────────────────────────────
  const currentRemote = getCurrentRemoteUrl(resolvedPath, 'origin');
  let remoteWasUpdated = false;

  if (currentRemote === null) {
    // No origin yet — add it
    runGit(resolvedPath, `remote add origin ${targetRemoteUrl}`);
    logger.info(`[GitIdentity] Remote added: ${targetRemoteUrl}`);
    remoteWasUpdated = true;
  } else if (normalisePath(currentRemote) !== normalisePath(targetRemoteUrl)) {
    // Origin exists but points somewhere else — correct it
    logger.info(`[GitIdentity] Remote was: ${currentRemote}`);
    runGit(resolvedPath, `remote set-url origin ${targetRemoteUrl}`);
    logger.info(`[GitIdentity] Remote corrected to: ${targetRemoteUrl}`);
    remoteWasUpdated = true;
  } else {
    logger.info(`[GitIdentity] Remote already correct: ${targetRemoteUrl}`);
  }

  return {
    repoPath: resolvedPath,
    repoName: derivedRepoName,
    isBrandLiftersRepo: isBrandLiftersRepo(resolvedPath),
    remoteUrl: targetRemoteUrl,
    remoteWasUpdated,
    identityWasSet: true,
  };
}

/**
 * Builds the SSH remote URL for a given repo name using the configured alias.
 *
 * Output format: git@github-brandlifters:brandlifters/<repoName>.git
 *
 * @param repoName  GitHub repo name (e.g. "demo-dental-clinic")
 */
export function buildSshRemoteUrl(repoName: string): string {
  return `git@${env.BRANDLIFTERS_SSH_ALIAS}:${env.BRANDLIFTERS_GITHUB_ORG}/${repoName}.git`;
}

/**
 * Derives a repo name from its directory path.
 * Uses the last segment of the path as the repo name.
 *
 * e.g. "C:/Users/abdul/brandlifters-material/demo-dental-clinic" → "demo-dental-clinic"
 */
export function deriveRepoName(repoPath: string): string {
  return path.basename(path.resolve(repoPath));
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the current URL for the named remote, or null if the remote
 * doesn't exist yet.
 */
function getCurrentRemoteUrl(cwd: string, remoteName: string): string | null {
  try {
    return execSync(`git remote get-url ${remoteName}`, { cwd, stdio: 'pipe' })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Runs a git command in the given directory and pipes stdout/stderr to the
 * logger at debug level. Throws on non-zero exit.
 */
function runGit(cwd: string, args: string): void {
  const cmd = `git ${args}`;
  logger.debug(`[GitIdentity] $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'pipe' });
}

/**
 * Normalises a path string for reliable cross-platform comparison:
 *   - Resolves to absolute
 *   - Converts backslashes to forward slashes (Windows compat)
 *   - Strips trailing slash
 *   - Lowercases (Windows FS is case-insensitive)
 */
function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}
