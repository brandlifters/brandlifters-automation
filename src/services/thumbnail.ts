/**
 * Thumbnail Service
 *
 * Takes the raw screenshot PNG and produces a polished portfolio thumbnail:
 *   - Crops to 16:9 aspect ratio
 *   - Resizes to a consistent output size
 *   - Converts to WebP for smaller file sizes
 *
 * This keeps the portfolio cards looking consistent regardless of how
 * individual demo sites are laid out.
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Target dimensions for portfolio card thumbnails (16:9)
const THUMBNAIL_WIDTH = 1200;
const THUMBNAIL_HEIGHT = 675;

// WebP quality — 85 gives excellent quality at ~40% smaller than PNG
const WEBP_QUALITY = 85;

/**
 * Generates a portfolio thumbnail from a raw screenshot.
 *
 * @param screenshotPath  Path to the PNG screenshot
 * @param siteName        Used to name the output file
 * @returns               Absolute path to the WebP thumbnail
 */
export async function generateThumbnail(
  screenshotPath: string,
  siteName: string
): Promise<string> {
  if (!fs.existsSync(screenshotPath)) {
    throw new Error(`Screenshot not found at: ${screenshotPath}`);
  }

  const outputDir = path.resolve(env.THUMBNAIL_OUTPUT_DIR);
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${siteName}.webp`);

  logger.info(`[Thumbnail] Generating thumbnail from: ${screenshotPath}`);

  await sharp(screenshotPath)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
      fit: 'cover',       // Crop to fill — no letterboxing
      position: 'top',    // Favour the top of the page (where hero content lives)
    })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);
  const sizeKb = Math.round(stats.size / 1024);
  logger.info(`[Thumbnail] Saved (${sizeKb} KB): ${outputPath}`);

  return outputPath;
}
