/**
 * Loads and validates demo.config.json from a demo website directory.
 *
 * This is used both by the CLI publish command (reads from the demo's local
 * path) and by the webhook handler (re-reads config after deployment).
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
  primaryColor: z.string().optional(),
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
  const configPath = path.join(demoDir, 'demo.config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `demo.config.json not found at ${configPath}.\n` +
        'Every demo website repo must include this file. See demo.config.example.json for reference.'
    );
  }

  logger.info(`Loading demo config from ${configPath}`);

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Failed to parse demo.config.json: ${(err as Error).message}`);
  }

  const result = DemoConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`demo.config.json validation failed:\n${issues}`);
  }

  logger.info(`Config loaded: [${result.data.industry}] ${result.data.title}`);
  return result.data as DemoConfig;
}
