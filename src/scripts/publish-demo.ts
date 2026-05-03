/**
 * publish-demo — Full pipeline for a NEW demo site
 *
 * Steps:
 *   1. Load + validate demo.config.json
 *   2. Create GitHub repo (if it doesn't exist)
 *   3. Push demo code to GitHub
 *   4. Create Vercel project linked to the GitHub repo (if it doesn't exist)
 *   5. Trigger deployment ONLY if project is new, then wait for it to go live
 *   6. Capture screenshot + generate WebP thumbnail
 *   7. Push thumbnail to demo repo, update website demos.json, push website
 *
 * Usage:
 *   npm run publish-demo -- --path "C:\path\to\demo"
 *   npm run publish-demo -- --path "..." --github-only
 *   npm run publish-demo -- --path "..." --no-portfolio
 */

import path from 'path';
import fs from 'fs';
import { loadDemoConfig } from '../utils/config-loader';
import {
  ensureGitHubRepo,
  pushToGitHub,
  triggerDeployCommit,
  uploadThumbnailToGitHub,
} from '../services/github';
import { ensureVercelProject, waitForDeployment } from '../services/vercel';
import { captureScreenshot } from '../services/screenshot';
import { generateThumbnail } from '../services/thumbnail';
import { publishToWebsitePortfolio } from '../services/website-portfolio';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { PublishPipelineState } from '../types';

// ─── CLI Args ──────────────────────────────────────────────────────────────────

function getArgs(): { demoPath: string; githubOnly: boolean; noPortfolio: boolean } {
  const args = process.argv.slice(2);
  const pathFlag = args.indexOf('--path');
  const githubOnly = args.includes('--github-only');
  const noPortfolio = args.includes('--no-portfolio');

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
      return { demoPath: process.cwd(), githubOnly, noPortfolio };
    }
    console.error(
      '\nUsage:\n' +
        '  npm run publish-demo -- --path "C:\\path\\to\\demo" [--github-only] [--no-portfolio]\n'
    );
    process.exit(1);
  }

  return { demoPath, githubOnly, noPortfolio };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { demoPath, githubOnly, noPortfolio } = getArgs();

  const state: PublishPipelineState = { config: {} as never, errors: [] };

  try {
    logger.info('═══════════════════════════════════════════════');
    logger.info('  BrandLifters — publish-demo (new)');
    if (githubOnly) logger.info('  Mode: --github-only');
    if (noPortfolio) logger.info('  Mode: --no-portfolio');
    logger.info('═══════════════════════════════════════════════');

    // Step 1
    state.config = loadDemoConfig(demoPath);
    logger.info(`Demo: ${state.config.title} (${state.config.industry})`);

    // Step 2
    const totalSteps = githubOnly ? 3 : noPortfolio ? 5 : 7;
    logger.info(`\n[2/${totalSteps}] Ensuring GitHub repo...`);
    state.github = await ensureGitHubRepo(state.config);

    // Step 3
    logger.info(`\n[3/${totalSteps}] Pushing code to GitHub...`);
    await pushToGitHub(state.config, state.github);

    if (githubOnly) { printSuccess(state, githubOnly, noPortfolio); return; }

    // Step 4
    logger.info(`\n[4/${totalSteps}] Ensuring Vercel project...`);
    state.vercel = await ensureVercelProject(state.config, env.GITHUB_OWNER);

    // Step 5 — only trigger an empty commit if the Vercel project was just created.
    // For existing projects, the push in step 3 already triggered a deployment.
    logger.info(`\n[5/${totalSteps}] Waiting for Vercel deployment...`);
    const triggerTime = Date.now();

    if (!state.vercel.alreadyExisted) {
      logger.info('[Vercel] New project — pushing trigger commit...');
      triggerDeployCommit(state.config);
    } else {
      logger.info('[Vercel] Existing project — code push already triggered deployment.');
    }

    state.deploymentUrl = await waitForDeployment(
      state.vercel.projectId,
      state.config.vercelProjectName,
      triggerTime
    );

    if (noPortfolio) {
      state.completedAt = new Date().toISOString();
      printSuccess(state, githubOnly, noPortfolio);
      return;
    }

    // Step 6
    logger.info(`\n[6/${totalSteps}] Capturing screenshot and generating thumbnail...`);
    const screenshotPath = await captureScreenshot(state.deploymentUrl, state.config.name);
    const thumbnailPath = await generateThumbnail(screenshotPath, state.config.name);

    // Step 7
    logger.info(`\n[7/${totalSteps}] Uploading thumbnail and updating website portfolio...`);
    state.thumbnailUrl = uploadThumbnailToGitHub(state.config, thumbnailPath);

    await publishToWebsitePortfolio({
      id: state.config.name,
      industry: state.config.industry,
      name: state.config.title,
      description: state.config.description,
      features: state.config.features ?? [],
      demoUrl: state.deploymentUrl,
      thumbnailUrl: state.thumbnailUrl,
      accentFrom: state.config.accentFrom ?? '#0d8e8b',
      accentTo: state.config.accentTo ?? '#22d3ee',
      publishedAt: new Date().toISOString(),
    });

    state.portfolioUpdated = true;
    state.completedAt = new Date().toISOString();
    printSuccess(state, githubOnly, noPortfolio);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.errors.push(message);
    logger.error(`\n✖ Publish failed:\n  ${message}`);
    if (err instanceof Error && err.stack) logger.debug(err.stack);
    writeSnapshot(state);
    process.exit(1);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function printSuccess(
  state: PublishPipelineState,
  githubOnly: boolean,
  noPortfolio: boolean
): void {
  const { config, github, vercel, deploymentUrl, thumbnailUrl } = state;
  logger.info('\n═══════════════════════════════════════════════');
  logger.info('  ✔ publish-demo complete!');
  logger.info('═══════════════════════════════════════════════');
  logger.info(`  Demo:     ${config.title} (${config.industry})`);
  logger.info(`  GitHub:   ${github?.htmlUrl}`);
  if (!githubOnly) {
    logger.info(`  Vercel:   ${vercel?.projectName}`);
    logger.info(`  Live URL: ${deploymentUrl}`);
  }
  if (!githubOnly && !noPortfolio) {
    logger.info(`  Thumbnail: ${thumbnailUrl}`);
    logger.info(`  Portfolio updated — demo is live.`);
  }
  logger.info('═══════════════════════════════════════════════\n');
}

function writeSnapshot(state: PublishPipelineState): void {
  try {
    const dir = './output/snapshots';
    fs.mkdirSync(dir, { recursive: true });
    const file = `${state.config?.name ?? 'unknown'}-${Date.now()}.json`;
    fs.writeFileSync(path.join(dir, file), JSON.stringify(state, null, 2));
    logger.info(`Debug snapshot written to ${dir}/${file}`);
  } catch { /* non-fatal */ }
}

main();
