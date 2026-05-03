/**
 * push-automation — Commit and push all changes in the brandlifters-automation repo
 *
 * Use this after making edits to the automation scripts, services, or configs.
 *
 * Usage:
 *   npm run push-automation
 *   npm run push-automation -- --message "your commit message"
 */

import path from 'path';
import { pushAutomationRepo } from '../services/github';
import { logger } from '../utils/logger';

function getArgs(): { message: string } {
  const args = process.argv.slice(2);
  const msgFlag = args.indexOf('--message');

  if (msgFlag !== -1 && args[msgFlag + 1]) {
    return { message: args[msgFlag + 1] };
  }

  const positional = args.find((a) => !a.startsWith('--'));
  return { message: positional ?? 'chore: update automation' };
}

async function main() {
  const { message } = getArgs();
  // The automation repo is always the directory this script lives in (two levels up from src/scripts/)
  const automationPath = path.resolve(__dirname, '../../');

  logger.info('═══════════════════════════════════════════════');
  logger.info('  BrandLifters — push-automation');
  logger.info(`  Path:    ${automationPath}`);
  logger.info(`  Message: ${message}`);
  logger.info('═══════════════════════════════════════════════');

  try {
    pushAutomationRepo(automationPath, message);
    logger.info('\n  ✔ Automation repo pushed.\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`\n✖ push-automation failed:\n  ${msg}`);
    process.exit(1);
  }
}

main();
