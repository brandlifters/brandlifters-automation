/**
 * Website Portfolio Service
 *
 * Replaces the Framer CMS step. Adds a new live demo entry to
 * src/lib/data/demos.json in the brandlifters-website repo, then
 * commits and pushes so Vercel picks up the change and redeploys.
 *
 * The website repo must be checked out locally. Its path is read
 * from WEBSITE_REPO_PATH in .env (defaults to the sibling folder).
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { LiveDemo } from './website-portfolio.types';

export type { LiveDemo };

const DEMOS_JSON_RELATIVE = 'src/lib/data/demos.json';

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Adds or updates a demo entry in the website's demos.json, then
 * commits and pushes the change so Vercel redeploys the portfolio.
 */
export async function publishToWebsitePortfolio(demo: LiveDemo): Promise<void> {
  const websitePath = resolveWebsitePath();
  const demosPath = path.join(websitePath, DEMOS_JSON_RELATIVE);

  logger.info(`[WebsitePortfolio] Website repo: ${websitePath}`);
  logger.info(`[WebsitePortfolio] Adding demo: ${demo.id} (${demo.industry})`);

  const demos = readDemosJson(demosPath);
  const existing = demos.findIndex((d) => d.id === demo.id);

  if (existing >= 0) {
    demos[existing] = demo;
    logger.info(`[WebsitePortfolio] Updated existing entry: ${demo.id}`);
  } else {
    demos.unshift(demo); // live demos appear first
    logger.info(`[WebsitePortfolio] Inserted new entry: ${demo.id}`);
  }

  writeDemosJson(demosPath, demos);
  commitAndPush(websitePath, demo);

  logger.info(`[WebsitePortfolio] Portfolio updated — Vercel will redeploy.`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function resolveWebsitePath(): string {
  const fromEnv = process.env.WEBSITE_REPO_PATH;
  if (fromEnv) return path.resolve(fromEnv);

  // Default: sibling directory next to the automation repo
  const sibling = path.resolve(__dirname, '../../../brandlifters-website');
  if (fs.existsSync(sibling)) return sibling;

  throw new Error(
    'Could not locate the website repo. ' +
      'Set WEBSITE_REPO_PATH in .env to the absolute path of brandlifters-website.'
  );
}

function readDemosJson(demosPath: string): LiveDemo[] {
  if (!fs.existsSync(demosPath)) {
    throw new Error(`demos.json not found at: ${demosPath}`);
  }
  const raw = fs.readFileSync(demosPath, 'utf-8');
  return JSON.parse(raw) as LiveDemo[];
}

function writeDemosJson(demosPath: string, demos: LiveDemo[]): void {
  fs.writeFileSync(demosPath, JSON.stringify(demos, null, 2) + '\n', 'utf-8');
  logger.info(`[WebsitePortfolio] Wrote ${demos.length} demo(s) to demos.json`);
}

function commitAndPush(websitePath: string, demo: LiveDemo): void {
  runGit(websitePath, `add ${DEMOS_JSON_RELATIVE}`);

  const status = execSync('git status --porcelain', { cwd: websitePath }).toString().trim();
  if (!status) {
    logger.info('[WebsitePortfolio] No changes to commit — demos.json already up to date.');
    return;
  }

  runGit(
    websitePath,
    `commit -m "feat: add demo to portfolio [${demo.industry}] — ${demo.name}"`
  );
  runGit(websitePath, 'push origin main');
  logger.info('[WebsitePortfolio] Pushed to website repo — Vercel deployment triggered.');
}

function runGit(cwd: string, args: string): void {
  const cmd = `git ${args}`;
  logger.debug(`[WebsitePortfolio] $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'pipe' });
}
