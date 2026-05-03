/**
 * push-website — Commit and push all changes in the brandlifters-website repo
 *
 * Use this after making manual edits to the website (pages, components, styles, etc.)
 * Pushing to GitHub triggers Vercel to redeploy the website automatically.
 *
 * Usage:
 *   npm run push-website
 *   npm run push-website -- --message "your commit message"
 */

import path from 'path';
import { pushWebsiteRepo } from '../services/github';
import { logger } from '../utils/logger';
import { env } from '../config/env';

function getArgs(): { message: string } {
  const args = process.argv.slice(2);
  const msgFlag = args.indexOf('--message');

  if (msgFlag !== -1 && args[msgFlag + 1]) {
    return { message: args[msgFlag + 1] };
  }

  const positional = args.find((a) => !a.startsWith('--'));
  return { message: positional ?? 'chore: update website' };
}

async function main() {
  const { message } = getArgs();
  const websitePath = path.resolve(env.WEBSITE_REPO_PATH);

  logger.info('═══════════════════════════════════════════════');
  logger.info('  BrandLifters — push-website');
  logger.info(`  Path:    ${websitePath}`);
  logger.info(`  Message: ${message}`);
  logger.info('═══════════════════════════════════════════════');

  try {
    pushWebsiteRepo(websitePath, message);
    logger.info('\n  ✔ Website repo pushed — Vercel will redeploy.\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`\n✖ push-website failed:\n  ${msg}`);
    process.exit(1);
  }
}

main();
