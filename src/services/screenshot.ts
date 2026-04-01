/**
 * Screenshot Service
 *
 * Uses Playwright (Chromium) to capture a full-page screenshot of the
 * deployed demo website at a standardised viewport size.
 *
 * The screenshot is saved locally and then passed to the thumbnail service.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Standardised screenshot dimensions — consistent across all demo sites
const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;

/**
 * Captures a full-page screenshot of the given URL.
 *
 * @param url       Live URL of the deployed demo site
 * @param siteName  Used to name the output file (e.g. "dental-clinic-demo")
 * @returns         Absolute path to the saved screenshot PNG
 */
export async function captureScreenshot(url: string, siteName: string): Promise<string> {
  const outputDir = path.resolve(env.SCREENSHOT_OUTPUT_DIR);
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${siteName}.png`);

  logger.info(`[Screenshot] Launching browser for: ${url}`);

  const browser = await chromium.launch({
    // Headless Chromium — no UI needed
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      // Simulate a modern desktop device for consistent rendering
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Navigate and wait for the page to be fully loaded (network idle)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });

    // Extra wait for any CSS animations/transitions to settle
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: outputPath,
      fullPage: false, // Above-the-fold only — this is what becomes the thumbnail
      type: 'png',
    });

    logger.info(`[Screenshot] Saved to: ${outputPath}`);
    return outputPath;
  } finally {
    await browser.close();
  }
}
