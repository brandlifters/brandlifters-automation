/**
 * push-customer-site — Push code updates to an existing customer website
 *
 * Pushes updated code to GitHub. Vercel picks this up automatically via
 * the GitHub integration and redeploys — no polling, no empty commit needed.
 *
 * Use this whenever you've made code changes to a customer site that is
 * already live. To also refresh the portfolio thumbnail after the push,
 * run finalize-customer-site afterward.
 *
 * Usage:
 *   npm run push-customer-site -- --path "C:\path\to\site"
 */

import path from 'path';
import fs from 'fs';
import { loadSiteConfig } from '../utils/config-loader';
import { ensureGitHubRepo, pushToGitHub } from '../services/github';
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
        '  npm run push-customer-site -- --path "C:\\path\\to\\site"\n'
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
    logger.info('  BrandLifters — push-customer-site');
    logger.info('═══════════════════════════════════════════════');

    const config = loadSiteConfig(sitePath);
    logger.info(`Site: ${config.title} (${config.industry})`);

    logger.info('\n[1/2] Resolving GitHub repo...');
    const github = await ensureGitHubRepo(config);

    logger.info('\n[2/2] Pushing code to GitHub...');
    await pushToGitHub(config, github);

    logger.info('\n═══════════════════════════════════════════════');
    logger.info('  ✔ push-customer-site complete!');
    logger.info(`  Site:   ${config.title}`);
    logger.info(`  GitHub: ${github.htmlUrl}`);
    logger.info('  Vercel will redeploy automatically.');
    logger.info('═══════════════════════════════════════════════\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`\n✖ push-customer-site failed:\n  ${message}`);
    if (err instanceof Error && err.stack) logger.debug(err.stack);
    process.exit(1);
  }
}

main();
