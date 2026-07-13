/**
 * finalize-customer-site — Screenshot, thumbnail, and portfolio update for a live customer site
 *
 * Queries Vercel for the current production URL, captures a screenshot,
 * generates a thumbnail, uploads it to the site's GitHub repo, and adds
 * (or updates) the entry in the brandlifters-website portfolio.
 *
 * Run this after deploy-customer-site once the site looks correct, or
 * after push-customer-site when you want to refresh the portfolio card.
 *
 * Usage:
 *   npm run finalize-customer-site -- --path "C:\path\to\site"
 */

import path from 'path';
import fs from 'fs';
import { loadSiteConfig } from '../utils/config-loader';
import { getProjectProductionUrl } from '../services/vercel';
import { captureScreenshot } from '../services/screenshot';
import { generateThumbnail } from '../services/thumbnail';
import { copyThumbnailToWebsiteRepo, publishToWebsitePortfolio } from '../services/website-portfolio';
import { logger } from '../utils/logger';

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
        '  npm run finalize-customer-site -- --path "C:\\path\\to\\site"\n'
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
    logger.info('  BrandLifters — finalize-customer-site');
    logger.info('═══════════════════════════════════════════════');

    // Step 1
    const config = loadSiteConfig(sitePath);
    logger.info(`Site: ${config.title} (${config.industry})`);

    // Step 2 — resolve production URL without triggering a new deployment
    let deploymentUrl: string;
    if (config.previewUrl) {
      deploymentUrl = config.previewUrl;
      logger.info(`\n[2/4] Using custom domain from config: ${deploymentUrl}`);
    } else {
      logger.info('\n[2/4] Fetching production URL from Vercel...');
      deploymentUrl = await getProjectProductionUrl(config.vercelProjectName);
      logger.info(`[2/4] Live URL: ${deploymentUrl}`);
    }

    // Step 3
    logger.info('\n[3/4] Capturing screenshot and generating thumbnail...');
    const screenshotPath = await captureScreenshot(deploymentUrl, config.name);
    const thumbnailPath = await generateThumbnail(screenshotPath, config.name);

    // Step 4
    logger.info('\n[4/4] Copying thumbnail to website repo and updating portfolio...');
    const thumbnailUrl = copyThumbnailToWebsiteRepo(config.name, thumbnailPath);

    await publishToWebsitePortfolio({
      id: config.name,
      industry: config.industry,
      name: config.title,
      description: config.description,
      features: config.features ?? [],
      tags: config.tags,
      demoUrl: deploymentUrl,
      thumbnailUrl,
      accentFrom: config.accentFrom ?? '#0d8e8b',
      accentTo: config.accentTo ?? '#22d3ee',
      publishedAt: new Date().toISOString(),
      isCustomerSite: true,
    });

    logger.info('\n═══════════════════════════════════════════════');
    logger.info('  ✔ finalize-customer-site complete!');
    logger.info('═══════════════════════════════════════════════');
    logger.info(`  Site:      ${config.title}`);
    logger.info(`  Live URL:  ${deploymentUrl}`);
    logger.info(`  Thumbnail: ${thumbnailUrl} (served from brandlifters-website)`);
    logger.info('  Portfolio updated — site is live on the website.');
    logger.info('═══════════════════════════════════════════════\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`\n✖ finalize-customer-site failed:\n  ${message}`);
    if (err instanceof Error && err.stack) logger.debug(err.stack);
    process.exit(1);
  }
}

main();
