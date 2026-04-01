/**
 * Vercel Webhook Route
 *
 * POST /api/vercel-webhook
 *
 * Listens for Vercel deployment events and triggers the post-deployment
 * pipeline when a deployment reaches the READY state:
 *
 *   1. Verify the webhook signature (HMAC-SHA1 from Vercel)
 *   2. Check if the event is a successful deployment
 *   3. Identify which demo site was deployed via the project name
 *   4. Capture a screenshot of the live site
 *   5. Generate a thumbnail
 *   6. Create a Framer CMS item with all metadata
 *   7. Publish the Framer site
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { captureScreenshot } from '../../services/screenshot';
import { generateThumbnail } from '../../services/thumbnail';
import {
  createFramerCMSItem,
  uploadThumbnailToFramer,
  publishFramerSite,
} from '../../services/framer';
import { VercelWebhookPayload } from '../../types';

export const webhookRouter = Router();

// ─── Route Handler ─────────────────────────────────────────────────────────────

webhookRouter.post('/vercel-webhook', async (req: Request, res: Response) => {
  // ── Step 1: Verify webhook signature ──────────────────────────────────────
  const signature = req.headers['x-vercel-signature'] as string | undefined;

  if (!signature || !isValidSignature(req.body, signature)) {
    logger.warn('[Webhook] Invalid signature — request rejected');
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  // Parse the payload — rawBody is available because of express.raw() in server.ts
  let payload: VercelWebhookPayload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch {
    logger.warn('[Webhook] Malformed JSON body');
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  logger.info(`[Webhook] Received event: ${payload.type}`);

  // ── Step 2: Filter for deployment.succeeded events ────────────────────────
  if (payload.type !== 'deployment.succeeded' && payload.type !== 'deployment-ready') {
    // We only care about successful deployments — ignore everything else
    logger.info(`[Webhook] Ignored event type: ${payload.type}`);
    res.status(200).json({ message: 'Event type ignored' });
    return;
  }

  const { deployment, project } = payload.payload;
  const projectName = project.name;
  const deployedUrl = `https://${payload.payload.alias[0] ?? deployment.url}`;

  logger.info(`[Webhook] Deployment ready: ${projectName} → ${deployedUrl}`);

  // Respond immediately to Vercel (must be < 30s or Vercel retries the webhook)
  // The heavy pipeline runs in the background
  res.status(200).json({ message: 'Webhook received — processing started' });

  // ── Step 3–7: Run the post-deployment pipeline asynchronously ─────────────
  runPostDeploymentPipeline(projectName, deployedUrl).catch((err) => {
    logger.error(`[Webhook] Pipeline error for ${projectName}: ${(err as Error).message}`);
  });
});

// ─── Post-Deployment Pipeline ──────────────────────────────────────────────────

async function runPostDeploymentPipeline(
  projectName: string,
  deployedUrl: string
): Promise<void> {
  logger.info(`\n[Pipeline] Starting post-deployment pipeline for: ${projectName}`);

  // ── Step 3: Screenshot ─────────────────────────────────────────────────────
  logger.info('[Pipeline] Capturing screenshot...');
  const screenshotPath = await captureScreenshot(deployedUrl, projectName);

  // ── Step 4: Thumbnail ──────────────────────────────────────────────────────
  logger.info('[Pipeline] Generating thumbnail...');
  const thumbnailPath = await generateThumbnail(screenshotPath, projectName);

  // ── Step 5: Upload thumbnail to Framer ────────────────────────────────────
  logger.info('[Pipeline] Uploading thumbnail to Framer...');
  const thumbnailUrl = await uploadThumbnailToFramer(thumbnailPath);

  // ── Step 6: Create Framer CMS item ────────────────────────────────────────
  logger.info('[Pipeline] Creating Framer CMS item...');

  // Derive a human-readable slug from the project name
  const slug = projectName.replace(/^demo-/, '').toLowerCase();

  await createFramerCMSItem({
    title: formatTitle(projectName),
    industry: formatIndustry(projectName),
    description: `A premium, conversion-focused demo website showcasing what BrandLifters can build for a ${formatIndustry(projectName).toLowerCase()} business.`,
    tags: slug,
    liveUrl: deployedUrl,
    thumbnailUrl,
    slug,
  });

  // ── Step 7: Publish Framer site ────────────────────────────────────────────
  logger.info('[Pipeline] Publishing Framer site...');
  await publishFramerSite();

  logger.info(`\n[Pipeline] ✔ Complete — ${projectName} is now live on your portfolio!`);
  logger.info(`  Live URL:  ${deployedUrl}`);
  logger.info(`  Thumbnail: ${thumbnailUrl}`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verifies the Vercel webhook signature using HMAC-SHA1.
 *
 * Vercel signs the raw request body with your WEBHOOK_SECRET.
 * Docs: https://vercel.com/docs/observability/webhooks/webhooks-api#securing-webhooks
 */
function isValidSignature(rawBody: Buffer, receivedSignature: string): boolean {
  const expected = crypto
    .createHmac('sha1', env.WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );
  } catch {
    // Buffers differ in length → not equal
    return false;
  }
}

/** "demo-dental-clinic" → "SmileBright Dental" — placeholder; override with demo.config.json in V2 */
function formatTitle(projectName: string): string {
  return projectName
    .replace(/^demo-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** "demo-dental-clinic" → "Dental Clinic" */
function formatIndustry(projectName: string): string {
  return projectName
    .replace(/^demo-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
