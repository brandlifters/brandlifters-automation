/**
 * configure-repo CLI Script
 *
 * Usage:
 *   npm run configure-repo                           # configures the current directory
 *   npm run configure-repo -- --path /path/to/repo  # configures a specific repo
 *
 * PURPOSE:
 *   Applies the BrandLifters git identity to any repo under brandlifters-material.
 *   This is the manual/retroactive equivalent of what publish-demo does automatically.
 *
 *   Use this when:
 *     - You cloned a repo that already exists on GitHub
 *     - You scaffolded a new project outside the publish-demo pipeline
 *     - A repo's remote was accidentally reset or points to the wrong account
 *     - You want to verify a repo is correctly configured
 *
 * WHAT IT SETS:
 *   - git config user.name  "brandlifters"         (local, repo-scoped)
 *   - git config user.email "brandliftersseo@gmail.com" (local, repo-scoped)
 *   - git remote origin     git@github-brandlifters:brandlifters/<repoName>.git
 *
 * SAFETY:
 *   - Only operates on the target directory — never touches other repos
 *   - Refuses to run if the path is not under BRANDLIFTERS_PARENT_DIR
 *   - Sets local git config only (does not modify your global ~/.gitconfig)
 *   - Does NOT commit, push, or modify any files
 */

import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { configureGitIdentity, isBrandLiftersRepo, deriveRepoName } from '../utils/git-identity';
import { logger } from '../utils/logger';
import { env } from '../config/env';

// ─── CLI Argument Parsing ───────────────────────────────────────────────────────

function getArgs(): { repoPath: string } {
  const args = process.argv.slice(2);
  const pathFlag = args.indexOf('--path');

  if (pathFlag !== -1 && args[pathFlag + 1]) {
    return { repoPath: path.resolve(args[pathFlag + 1]) };
  }

  // Default: current working directory
  return { repoPath: process.cwd() };
}

// ─── Main ───────────────────────────────────────────────────────────────────────

function main(): void {
  const { repoPath } = getArgs();

  logger.info('═══════════════════════════════════════════════');
  logger.info('  BrandLifters — configure-repo');
  logger.info('═══════════════════════════════════════════════');
  logger.info(`  Target: ${repoPath}`);

  // ── Guard 1: Directory must exist ─────────────────────────────────────────
  if (!fs.existsSync(repoPath)) {
    logger.error(`Directory does not exist: ${repoPath}`);
    process.exit(1);
  }

  // ── Guard 2: Must be under brandlifters-material ──────────────────────────
  if (!isBrandLiftersRepo(repoPath)) {
    logger.error(
      `\n  Refused: ${repoPath}\n` +
        `  is not under the BrandLifters parent directory:\n` +
        `  ${env.BRANDLIFTERS_PARENT_DIR}\n\n` +
        `  This script only configures repos inside that folder.\n` +
        `  If your folder location changed, update BRANDLIFTERS_PARENT_DIR in .env`
    );
    process.exit(1);
  }

  // ── Guard 3: Must be a git repo ───────────────────────────────────────────
  if (!isGitRepo(repoPath)) {
    logger.error(
      `\n  ${repoPath} is not a git repository.\n` +
        `  Run "git init" inside it first, then re-run configure-repo.`
    );
    process.exit(1);
  }

  // ── Apply identity ────────────────────────────────────────────────────────
  const repoName = deriveRepoName(repoPath);
  logger.info(`  Repo name: ${repoName}`);

  try {
    const status = configureGitIdentity(repoPath, repoName);

    logger.info('\n═══════════════════════════════════════════════');
    logger.info('  ✔ Configuration applied');
    logger.info('═══════════════════════════════════════════════');
    logger.info(`  Repo:    ${status.repoName}`);
    logger.info(`  Remote:  ${status.remoteUrl}`);
    logger.info(
      `  Remote:  ${status.remoteWasUpdated ? 'updated' : 'already correct (no change)'}`
    );
    logger.info(`  Identity: set (local scope)`);
    logger.info('');
    logger.info('  Verify with:');
    logger.info(`    git -C "${repoPath}" remote -v`);
    logger.info(`    git -C "${repoPath}" config user.name`);
    logger.info(`    git -C "${repoPath}" config user.email`);
    logger.info('═══════════════════════════════════════════════\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`\n✖ Configuration failed: ${message}`);
    process.exit(1);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────────

main();
