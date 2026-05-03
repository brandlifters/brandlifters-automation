import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const EnvSchema = z.object({
  // GitHub API — Octokit REST calls (repo creation, metadata)
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  GITHUB_OWNER: z.string().min(1, 'GITHUB_OWNER is required'),

  // Vercel
  VERCEL_TOKEN: z.string().min(1, 'VERCEL_TOKEN is required'),
  VERCEL_TEAM_ID: z.string().optional(),

  // Output directories
  SCREENSHOT_OUTPUT_DIR: z.string().default('./output/screenshots'),
  THUMBNAIL_OUTPUT_DIR: z.string().default('./output/thumbnails'),

  // Absolute path to brandlifters-website checkout.
  // The portfolio service writes demos.json here and pushes to trigger a Vercel redeploy.
  WEBSITE_REPO_PATH: z
    .string()
    .default('C:/Users/abdul/brandlifters-material/brandlifters-website'),

  // Absolute path to the parent folder scoping all BrandLifters repos.
  BRANDLIFTERS_PARENT_DIR: z
    .string()
    .default('C:/Users/abdul/brandlifters-material'),

  // SSH host alias in ~/.ssh/config for the BrandLifters account.
  BRANDLIFTERS_SSH_ALIAS: z.string().default('github-brandlifters'),

  // GitHub org/username used in SSH remote paths.
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
