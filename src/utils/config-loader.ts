/**
 * Loads and validates config files from demo and customer site directories.
 *
 * loadDemoConfig — reads demo.config.json (for demo sites)
 * loadSiteConfig — reads site.config.json (for customer websites)
 *
 * Both use the same schema and return the same DemoConfig type.
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { DemoConfig } from '../types';
import { logger } from './logger';

// Zod schema mirrors the DemoConfig interface to enforce shape at runtime
const DemoConfigSchema = z.object({
  name: z.string().min(1),
  industry: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  primaryColor: z.string().optional(),
  accentFrom: z.string().optional(),
  accentTo: z.string().optional(),
  repoName: z.string().min(1).regex(/^[a-z0-9-]+$/, {
    message: 'repoName must be lowercase, alphanumeric with hyphens only',
  }),
  vercelProjectName: z.string().min(1).regex(/^[a-z0-9-]+$/, {
    message: 'vercelProjectName must be lowercase, alphanumeric with hyphens only',
  }),
  localPath: z.string().min(1),
  previewUrl: z.string().default(''),
});

/**
 * Reads demo.config.json from the given directory and validates its contents.
 *
 * @param demoDir  Absolute path to the demo website root directory.
 * @returns        Validated DemoConfig object.
 * @throws         If file is missing or any required fields fail validation.
 */
export function loadDemoConfig(demoDir: string): DemoConfig {
  return loadConfigFile(demoDir, 'demo.config.json');
}

/**
 * Reads site.config.json from the given directory and validates its contents.
 * Used for customer websites (same schema as demo.config.json).
 *
 * @param siteDir  Absolute path to the customer site root directory.
 * @returns        Validated DemoConfig object.
 * @throws         If file is missing or any required fields fail validation.
 */
export function loadSiteConfig(siteDir: string): DemoConfig {
  return loadConfigFile(siteDir, 'site.config.json');
}

function loadConfigFile(dir: string, filename: string): DemoConfig {
  const configPath = path.join(dir, filename);

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `${filename} not found at ${configPath}.\n` +
        `Every site directory must include this file. See demo.config.example.json for the field reference.`
    );
  }

  logger.info(`Loading config from ${configPath}`);

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Failed to parse ${filename}: ${(err as Error).message}`);
  }

  const result = DemoConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`${filename} validation failed:\n${issues}`);
  }

  logger.info(`Config loaded: [${result.data.industry}] ${result.data.title}`);
  return result.data as DemoConfig;
}
