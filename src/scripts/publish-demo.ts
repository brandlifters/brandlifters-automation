/**
 * publish-demo CLI Script
 *
 * Entry point for: npm run publish-demo -- --path /path/to/demo
 *
 * PIPELINE:
 *   1. Load + validate demo.config.json from the demo directory
 *   2. Ensure the GitHub repo exists (create if not)
 *   3. Push the local demo code to GitHub
 *   4. Ensure the Vercel project exists and is linked to the GitHub repo
 *   5. Log success — Vercel auto-deploys from GitHub push.
 *      Webhook handles the rest (screenshot → Framer) asynchronously.
 */

import path from 'path';
import { loadDemoConfig } from '../utils/config-loader';
import { ensureGitHubRepo, pushToGitHub } from '../services/github';
import { ensureVercelProject } from '../services/vercel';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { PublishPipelineState } from '../types';
import fs from 'fs';

// ─── CLI Argument Parsing ───────────────────────────────────────────────────────

function getArgs(): { demoPath: string; githubOnly: boolean } {
  const args = process.argv.slice(2);

  // npm strips --path and --github-only when passed via `npm run x -- --flag value`.
  // To work around this, also check the DEMO_PATH and GITHUB_ONLY env vars,
  // and fall back to accepting the first positional argument as the path.
  const pathFlag = args.indexOf('--path');
  const githubOnly = args.includes('--github-only') || process.env.GITHUB_ONLY === '1';

  let demoPath: string | undefined;

  if (pathFlag !== -1 && args[pathFlag + 1]) {
    // Normal case: --path was not stripped by npm
    demoPath = path.resolve(args[pathFlag + 1]);
  } else if (process.env.DEMO_PATH) {
    // Env var fallback: set DEMO_PATH=... before running
    demoPath = path.resolve(process.env.DEMO_PATH);
  } else {
    // npm strips --path and passes its value as the first positional arg
    const positional = args.find(a => !a.startsWith('--'));
    if (positional) {
      demoPath = path.resolve(positional);
    }
  }

  if (!demoPath) {
    // Last resort: look for demo.config.json in the current working directory
    const cwdConfigPath = path.join(process.cwd(), 'demo.config.json');
    if (fs.existsSync(cwdConfigPath)) {
      return { demoPath: process.cwd(), githubOnly };
    }

    console.error(
      '\nUsage:\n' +
        '  npx ts-node src/scripts/publish-demo.ts --path "C:\\path\\to\\demo" [--github-only]\n' +
        '\nOr via env vars (avoids npm flag stripping):\n' +
        '  DEMO_PATH="C:\\path\\to\\demo" GITHUB_ONLY=1 npm run publish-demo\n'
    );
    process.exit(1);
  }

  return { demoPath, githubOnly };
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const { demoPath, githubOnly } = getArgs();

  // ── State tracker — used for logging and error recovery ──
  const state: PublishPipelineState = {
    config: {} as never, // Will be populated in step 1
    errors: [],
  };

  try {
    // ── Step 1: Load config ────────────────────────────────────────────────────
    logger.info('═══════════════════════════════════════════════');
    logger.info('  BrandLifters — publish-demo');
    if (githubOnly) logger.info('  Mode: --github-only (Vercel skipped)');
    logger.info('═══════════════════════════════════════════════');

    state.config = loadDemoConfig(demoPath);

    logger.info(`Demo: ${state.config.title} (${state.config.industry})`);
    logger.info(`Repo: ${state.config.repoName}`);

    // ── Step 2: GitHub repo ────────────────────────────────────────────────────
    const totalSteps = githubOnly ? 3 : 4;
    logger.info(`\n[Step 2/${totalSteps}] Ensuring GitHub repo...`);
    state.github = await ensureGitHubRepo(state.config);

    // ── Step 3: Push code ──────────────────────────────────────────────────────
    logger.info(`\n[Step 3/${totalSteps}] Pushing code to GitHub...`);
    await pushToGitHub(state.config, state.github);

    // ── Step 4: Vercel project (skipped when --github-only) ────────────────────
    if (!githubOnly) {
      logger.info(`\n[Step 4/${totalSteps}] Ensuring Vercel project...`);
      state.vercel = await ensureVercelProject(state.config, env.GITHUB_OWNER);
    }

    // ── Done ───────────────────────────────────────────────────────────────────
    printSuccess(state, githubOnly);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.errors.push(message);

    logger.error(`\n✖ Publish failed:\n  ${message}`);

    if (err instanceof Error && err.stack) {
      logger.debug(err.stack);
    }

    // Write the pipeline state to a debug file for post-mortem inspection
    writeStateSnapshot(state);
    process.exit(1);
  }
}

// ─── Output Helpers ─────────────────────────────────────────────────────────────

function printSuccess(state: PublishPipelineState, githubOnly: boolean): void {
  const { config, github, vercel } = state;

  logger.info('\n═══════════════════════════════════════════════');
  logger.info('  ✔ Publish complete!');
  logger.info('═══════════════════════════════════════════════');
  logger.info(`  Demo:     ${config.title}`);
  logger.info(`  Industry: ${config.industry}`);
  logger.info(`  GitHub:   ${github?.htmlUrl}`);

  if (githubOnly) {
    logger.info('');
    logger.info('  Stopped after GitHub push (--github-only).');
    logger.info('  Next: add VERCEL_TOKEN to .env and re-run without --github-only');
  } else {
    logger.info(`  Vercel:   Project "${vercel?.projectName}" ready`);
    logger.info('');
    logger.info('  Vercel is now deploying from GitHub.');
    logger.info('  Once deployment succeeds, the webhook will:');
    logger.info('    → capture a screenshot');
    logger.info('    → generate a thumbnail');
    logger.info('    → create a Framer CMS item');
    logger.info('    → publish your portfolio');
  }

  logger.info('═══════════════════════════════════════════════\n');
}

function writeStateSnapshot(state: PublishPipelineState): void {
  try {
    const snapshotDir = './output/snapshots';
    fs.mkdirSync(snapshotDir, { recursive: true });
    const filename = `${state.config?.name ?? 'unknown'}-${Date.now()}.json`;
    fs.writeFileSync(
      path.join(snapshotDir, filename),
      JSON.stringify(state, null, 2)
    );
    logger.info(`Debug snapshot written to ${snapshotDir}/${filename}`);
  } catch {
    // Non-fatal — best effort only
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────────

main();
