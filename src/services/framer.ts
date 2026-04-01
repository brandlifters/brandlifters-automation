/**
 * Framer Service
 *
 * Handles:
 *   - Creating a new CMS item in the Framer portfolio collection
 *   - Uploading the thumbnail image to Framer's asset API
 *   - Publishing the Framer site so changes go live immediately
 *
 * Uses the Framer Server API (REST).
 * Docs: https://www.framer.com/developers/server-api/
 */

import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { FramerCMSItem, FramerCreateItemResult } from '../types';

// ─── API Client ────────────────────────────────────────────────────────────────

function getFramerClient(): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.framer.com',
    headers: {
      Authorization: `Bearer ${env.FRAMER_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
}

// ─── CMS ───────────────────────────────────────────────────────────────────────

/**
 * Creates a new item in the Framer CMS portfolio collection.
 *
 * The `slug` field is auto-derived from the title and used as the URL segment.
 * If a CMS item with the same slug already exists, Framer will return an error —
 * callers should handle duplicates gracefully.
 */
export async function createFramerCMSItem(
  item: FramerCMSItem
): Promise<FramerCreateItemResult> {
  const client = getFramerClient();

  logger.info(`[Framer] Creating CMS item: "${item.title}"`);

  const { data } = await client.post(
    `/v1/collections/${env.FRAMER_COLLECTION_ID}/items`,
    {
      slug: item.slug,
      fieldData: {
        title: item.title,
        industry: item.industry,
        description: item.description,
        tags: item.tags,
        liveUrl: item.liveUrl,
        // thumbnailUrl is set separately after asset upload
        ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
      },
    }
  );

  logger.info(`[Framer] CMS item created: ${data.id}`);
  return {
    itemId: data.id,
    slug: item.slug,
  };
}

/**
 * Updates an existing CMS item — used when re-publishing an updated demo.
 */
export async function updateFramerCMSItem(
  itemId: string,
  updates: Partial<FramerCMSItem>
): Promise<void> {
  const client = getFramerClient();

  logger.info(`[Framer] Updating CMS item: ${itemId}`);

  await client.patch(`/v1/collections/${env.FRAMER_COLLECTION_ID}/items/${itemId}`, {
    fieldData: {
      ...(updates.title ? { title: updates.title } : {}),
      ...(updates.liveUrl ? { liveUrl: updates.liveUrl } : {}),
      ...(updates.thumbnailUrl ? { thumbnailUrl: updates.thumbnailUrl } : {}),
      ...(updates.description ? { description: updates.description } : {}),
    },
  });

  logger.info(`[Framer] CMS item updated`);
}

/**
 * Uploads a thumbnail image to Framer's asset hosting and returns the hosted URL.
 * The URL is then stored in the CMS item's thumbnailUrl field.
 */
export async function uploadThumbnailToFramer(thumbnailPath: string): Promise<string> {
  const client = getFramerClient();

  if (!fs.existsSync(thumbnailPath)) {
    throw new Error(`Thumbnail file not found: ${thumbnailPath}`);
  }

  logger.info(`[Framer] Uploading thumbnail: ${path.basename(thumbnailPath)}`);

  const form = new FormData();
  form.append('file', fs.createReadStream(thumbnailPath), {
    filename: path.basename(thumbnailPath),
    contentType: 'image/webp',
  });

  const { data } = await axios.post('https://api.framer.com/v1/assets', form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${env.FRAMER_API_KEY}`,
    },
  });

  logger.info(`[Framer] Thumbnail uploaded: ${data.url}`);
  return data.url as string;
}

/**
 * Triggers a Framer site publish so the new CMS item becomes publicly visible.
 * This is the equivalent of clicking "Publish" in the Framer editor.
 */
export async function publishFramerSite(): Promise<void> {
  const client = getFramerClient();

  logger.info(`[Framer] Publishing site...`);

  await client.post('/v1/sites/publish');

  logger.info(`[Framer] Site published successfully`);
}
