/**
 * Shared TypeScript types for the BrandLifters automation system.
 *
 * Every module imports from here — never inline complex types in service files.
 */

// ─── Demo Configuration ────────────────────────────────────────────────────────

/**
 * Shape of demo.config.json that lives in each demo website repo.
 * This is the single source of truth for all automation metadata.
 */
export interface DemoConfig {
  /** Unique kebab-case identifier: "dental-clinic-demo" */
  name: string;

  /** Human-readable industry label: "Dental Clinic" */
  industry: string;

  /** Display title of the fake business: "SmileBright Dental" */
  title: string;

  /** Short description shown on the portfolio card */
  description: string;

  /** Optional tags for filtering in the portfolio */
  tags?: string[];

  /** Brand primary color (hex) — used for thumbnail overlays */
  primaryColor?: string;

  /** GitHub repo name to create/push to: "demo-dental-clinic" */
  repoName: string;

  /** Vercel project name to create/link: "demo-dental-clinic" */
  vercelProjectName: string;

  /**
   * Absolute or relative path to the demo website directory.
   * Used by the CLI to know what code to push to GitHub.
   */
  localPath: string;

  /**
   * Populated automatically after deployment — the live Vercel URL.
   * Leave empty string in the source file; automation fills it in.
   */
  previewUrl: string;
}

// ─── Vercel Webhook ────────────────────────────────────────────────────────────

/** Top-level Vercel webhook event payload */
export interface VercelWebhookPayload {
  type: string;
  id: string;
  createdAt: number;
  payload: VercelDeploymentPayload;
}

/** Inner deployment payload from Vercel webhook */
export interface VercelDeploymentPayload {
  deployment: {
    id: string;
    name: string;
    url: string;
    meta: Record<string, string>;
  };
  project: {
    id: string;
    name: string;
  };
  team?: {
    id: string;
  };
  url: string;
  alias: string[];
}

// ─── GitHub ────────────────────────────────────────────────────────────────────

export interface GitHubRepoResult {
  repoName: string;
  htmlUrl: string;
  cloneUrl: string;
  alreadyExisted: boolean;
}

// ─── Vercel ────────────────────────────────────────────────────────────────────

export interface VercelProjectResult {
  projectId: string;
  projectName: string;
  deploymentUrl: string | null;
  alreadyExisted: boolean;
}

// ─── Framer ────────────────────────────────────────────────────────────────────

export interface FramerCMSItem {
  title: string;
  industry: string;
  description: string;
  tags: string;
  liveUrl: string;
  thumbnailUrl?: string;
  slug: string;
}

export interface FramerCreateItemResult {
  itemId: string;
  slug: string;
}

// ─── Screenshot ────────────────────────────────────────────────────────────────

export interface ScreenshotResult {
  screenshotPath: string;
  thumbnailPath: string;
  width: number;
  height: number;
}

// ─── Pipeline State ────────────────────────────────────────────────────────────

/** Tracks progress through the publish-demo pipeline for logging/debugging */
export interface PublishPipelineState {
  config: DemoConfig;
  github?: GitHubRepoResult;
  vercel?: VercelProjectResult;
  screenshot?: ScreenshotResult;
  framerItemId?: string;
  completedAt?: string;
  errors: string[];
}
