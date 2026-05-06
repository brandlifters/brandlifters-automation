/**
 * deploy-customer-site — First-time deploy for a new customer website
 *
 * Steps:
 *   1. Load + validate site.config.json
 *   2. Create GitHub repo (if it doesn't exist)
 *   3. Push site code to GitHub
 *   4. Create Vercel project linked to the GitHub repo (if it doesn't exist)
 *   5. Trigger deployment (only if project is new) and wait until live
 *
 * No screenshot or portfolio update — run finalize-customer-site after
 * confirming the site looks right.
 *
 * Usage:
 *   npm run deploy-customer-site -- --path "C:\path\to\site"
 */

import path from 'path';
import fs from 'fs';
import { loadSiteConfig } from '../utils/config-loader';
import {
  ensureGitHubRepo,
  pushToGitHub,
  triggerDeployCommit,
} from '../services/github';
import { ensureVercelProject, waitForDeployment } from '../services/vercel';
import { logger } from '../utils/logger';
import { env } from '../config/env';

// ─── CLI Args ──────────────────────────────────────────────────────────────────

function getArgs(): { sitePath: string } {
  const args = process.argv.slice(2);
  const pathFlag = args.indexOf('--path');

  let sitePath: string | undefined;

  if (pathFlag !== -1 && args[pathFlag + 1]) {
    sitePath = path.resolve(args[pathFlag + 1]);
  } else if (process.env.SITE_PATH) {
    sitePath = path.resolve(process.env.SITE_PATH);
  } else {
    const positional = args.find((a) => !a.startsWith('--'));
    if (positional) sitePath = path.resolve(positional);
  }

  if (!sitePath) {
    if (fs.existsSync(path.join(process.cwd(), 'site.config.json'))) {
      return { sitePath: process.cwd() };
    }
    console.error(
      '\nUsage:\n' +
        '  npm run deploy-customer-site -- --path "C:\\path\\to\\site"\n'
    );
    process.exit(1);
  }

  return { sitePath };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { sitePath } = getArgs();

  try {
    logger.info('═══════════════════════════════════════════════');
    logger.info('  BrandLifters — deploy-customer-site (new)');
    logger.info('═══════════════════════════════════════════════');

    // Step 1
    const config = loadSiteConfig(sitePath);
    logger.info(`Site: ${config.title} (${config.industry})`);

    // Step 2
    logger.info('\n[2/5] Ensuring GitHub repo...');
    const github = await ensureGitHubRepo(config);

    // Step 3
    logger.info('\n[3/5] Pushing code to GitHub...');
    await pushToGitHub(config, github);

    // Step 4
    logger.info('\n[4/5] Ensuring Vercel project...');
    const vercel = await ensureVercelProject(config, env.GITHUB_OWNER);

    // Step 5 — trigger empty commit only if the Vercel project was just created.
    // If it already existed, the code push in step 3 triggered Vercel automatically.
    logger.info('\n[5/5] Waiting for Vercel deployment...');
    const triggerTime = Date.now();

    if (!vercel.alreadyExisted) {
      logger.info('[Vercel] New project — pushing trigger commit...');
      triggerDeployCommit(config);
    } else {
      logger.info('[Vercel] Existing project — code push already triggered deployment.');
    }

    const deploymentUrl = await waitForDeployment(
      vercel.projectId,
      config.vercelProjectName,
      triggerTime
    );

    logger.info('\n═══════════════════════════════════════════════');
    logger.info('  ✔ deploy-customer-site complete!');
    logger.info('═══════════════════════════════════════════════');
    logger.info(`  Site:     ${config.title} (${config.industry})`);
    logger.info(`  GitHub:   ${github.htmlUrl}`);
    logger.info(`  Vercel:   ${vercel.projectName}`);
    logger.info(`  Live URL: ${deploymentUrl}`);
    logger.info('');
    logger.info('  Next steps:');
    logger.info('    • Review the live site');
    logger.info('    • Run "npm run finalize-customer-site" to add it to the portfolio');
    logger.info('═══════════════════════════════════════════════\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`\n✖ deploy-customer-site failed:\n  ${message}`);
    if (err instanceof Error && err.stack) logger.debug(err.stack);
    process.exit(1);
  }
}

main();
