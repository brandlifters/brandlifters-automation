/**
 * update-demo — Push updates to an already-deployed demo site
 *
 * Use this when a demo already exists on GitHub + Vercel and you just
 * made code changes. It pushes the code, waits for Vercel to redeploy,
 * then refreshes the screenshot/thumbnail and updates the website portfolio.
 *
 * Unlike publish-demo, this script:
 *   - Never creates a new GitHub repo or Vercel project
 *   - Never pushes an empty trigger commit (the code push itself triggers Vercel)
 *   - Errors fast if the Vercel project does not already exist
 *
 * Usage:
 *   npm run update-demo -- --path "C:\path\to\demo"
 *   npm run update-demo -- --path "..." --code-only    (skip screenshot + portfolio)
 */

import path from 'path';
import fs from 'fs';
import { loadDemoConfig } from '../utils/config-loader';
import {
  ensureGitHubRepo,
  pushToGitHub,
  uploadThumbnailToGitHub,
} from '../services/github';
import { ensureVercelProject, waitForDeployment } from '../services/vercel';
import { captureScreenshot } from '../services/screenshot';
import { generateThumbnail } from '../services/thumbnail';
import { publishToWebsitePortfolio } from '../services/website-portfolio';
import { logger } from '../utils/logger';
import { env } from '../config/env';

// ─── CLI Args ──────────────────────────────────────────────────────────────────

function getArgs(): { demoPath: string; codeOnly: boolean } {
  const args = process.argv.slice(2);
  const pathFlag = args.indexOf('--path');
  const codeOnly = args.includes('--code-only');

  let demoPath: string | undefined;

  if (pathFlag !== -1 && args[pathFlag + 1]) {
    demoPath = path.resolve(args[pathFlag + 1]);
  } else if (process.env.DEMO_PATH) {
    demoPath = path.resolve(process.env.DEMO_PATH);
  } else {
    const positional = args.find((a) => !a.startsWith('--'));
    if (positional) demoPath = path.resolve(positional);
  }

  if (!demoPath) {
    if (fs.existsSync(path.join(process.cwd(), 'demo.config.json'))) {
      return { demoPath: process.cwd(), codeOnly };
    }
    console.error(
      '\nUsage:\n' +
        '  npm run update-demo -- --path "C:\\path\\to\\demo" [--code-only]\n'
    );
    process.exit(1);
  }

  return { demoPath, codeOnly };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { demoPath, codeOnly } = getArgs();

  try {
    logger.info('═══════════════════════════════════════════════');
    logger.info('  BrandLifters — update-demo');
    if (codeOnly) logger.info('  Mode: --code-only (skip screenshot + portfolio)');
    logger.info('═══════════════════════════════════════════════');

    const config = loadDemoConfig(demoPath);
    logger.info(`Demo: ${config.title} (${config.industry})`);

    // Verify the Vercel project exists before doing any work
    logger.info('\n[1] Verifying Vercel project exists...');
    const vercel = await ensureVercelProject(config, env.GITHUB_OWNER);
    if (!vercel.alreadyExisted) {
      logger.error(
        `\n✖ Vercel project "${config.vercelProjectName}" does not exist yet.\n` +
          `  Run "npm run publish-demo" instead to create it from scratch.`
      );
      process.exit(1);
    }
    logger.info(`[1] Verified: ${vercel.projectName} (${vercel.projectId})`);

    // Push code — this triggers Vercel automatically via the GitHub integration
    logger.info('\n[2] Pushing code to GitHub...');
    const github = await ensureGitHubRepo(config);
    const triggerTime = Date.now();
    await pushToGitHub(config, github);

    // Wait for Vercel to pick up the push and finish building
    logger.info('\n[3] Waiting for Vercel deployment...');
    const deploymentUrl = await waitForDeployment(
      vercel.projectId,
      config.vercelProjectName,
      triggerTime
    );
    logger.info(`[3] Live URL: ${deploymentUrl}`);

    if (codeOnly) {
      logger.info('\n═══════════════════════════════════════════════');
      logger.info('  ✔ update-demo complete! (code-only)');
      logger.info(`  Live URL: ${deploymentUrl}`);
      logger.info('═══════════════════════════════════════════════\n');
      return;
    }

    // Refresh screenshot + thumbnail
    logger.info('\n[4] Capturing screenshot and generating thumbnail...');
    const screenshotPath = await captureScreenshot(deploymentUrl, config.name);
    const thumbnailPath = await generateThumbnail(screenshotPath, config.name);

    // Push thumbnail and update portfolio
    logger.info('\n[5] Uploading thumbnail and updating website portfolio...');
    const thumbnailUrl = uploadThumbnailToGitHub(config, thumbnailPath);

    await publishToWebsitePortfolio({
      id: config.name,
      industry: config.industry,
      name: config.title,
      description: config.description,
      features: config.features ?? [],
      demoUrl: deploymentUrl,
      thumbnailUrl,
      accentFrom: config.accentFrom ?? '#0d8e8b',
      accentTo: config.accentTo ?? '#22d3ee',
      publishedAt: new Date().toISOString(),
    });

    logger.info('\n═══════════════════════════════════════════════');
    logger.info('  ✔ update-demo complete!');
    logger.info(`  Demo:      ${config.title}`);
    logger.info(`  Live URL:  ${deploymentUrl}`);
    logger.info(`  Thumbnail: ${thumbnailUrl}`);
    logger.info('═══════════════════════════════════════════════\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`\n✖ update-demo failed:\n  ${message}`);
    if (err instanceof Error && err.stack) logger.debug(err.stack);
    process.exit(1);
  }
}

main();
