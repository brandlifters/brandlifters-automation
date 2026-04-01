/**
 * Environment variable loading and validation.
 *
 * Uses zod to guarantee required vars are present at startup.
 * Import `env` from this module — never read process.env directly in services.
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the project root (two levels up from src/config/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const EnvSchema = z.object({
  // GitHub API (token used for Octokit REST calls — repo creation, metadata)
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  // The GitHub org/username that owns the repos (used in Octokit API calls)
  GITHUB_OWNER: z.string().min(1, 'GITHUB_OWNER is required'),

  // Vercel
  VERCEL_TOKEN: z.string().min(1, 'VERCEL_TOKEN is required'),
  VERCEL_TEAM_ID: z.string().optional(),

  // Framer
  FRAMER_API_KEY: z.string().min(1, 'FRAMER_API_KEY is required'),
  FRAMER_COLLECTION_ID: z.string().min(1, 'FRAMER_COLLECTION_ID is required'),

  // Webhook server
  WEBHOOK_SECRET: z.string().min(1, 'WEBHOOK_SECRET is required'),
  PORT: z.string().default('3000'),

  // Output directories
  SCREENSHOT_OUTPUT_DIR: z.string().default('./output/screenshots'),
  THUMBNAIL_OUTPUT_DIR: z.string().default('./output/thumbnails'),

  // ─── BrandLifters Git Account Targeting ──────────────────────────────────────
  // Absolute path to the parent folder that scopes BrandLifters repos.
  // Any git repo found under this path is treated as a BrandLifters repo.
  BRANDLIFTERS_PARENT_DIR: z
    .string()
    .default('C:/Users/abdul/brandlifters-material'),

  // The SSH host alias configured in ~/.ssh/config for the BrandLifters account.
  // Remote URLs will be: git@<SSH_ALIAS>:<ORG>/<repo>.git
  BRANDLIFTERS_SSH_ALIAS: z.string().default('github-brandlifters'),

  // GitHub org/username used in the SSH remote path (right side of the colon).
  BRANDLIFTERS_GITHUB_ORG: z.string().default('brandlifters'),

  // Git commit identity applied locally to every BrandLifters repo.
  BRANDLIFTERS_GIT_NAME: z.string().default('brandlifters'),
  BRANDLIFTERS_GIT_EMAIL: z.string().default('brandliftersseo@gmail.com'),
});

function loadEnv() {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Environment variable validation failed:\n${missing.join('\n')}\n\nCopy .env.example → .env and fill in the values.`
    );
  }

  return result.data;
}

export const env = loadEnv();
