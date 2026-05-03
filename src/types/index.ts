// Shared TypeScript types for the BrandLifters automation system.

// ─── Demo Configuration ────────────────────────────────────────────────────────

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
  /** Brand primary color (hex) */
  primaryColor?: string;
  /** GitHub repo name to create/push to: "demo-dental-clinic" */
  repoName: string;
  /** Vercel project name to create/link: "demo-dental-clinic" */
  vercelProjectName: string;
  /** Absolute path to the demo website directory on disk */
  localPath: string;
  /** Populated automatically after deployment — the live Vercel URL */
  previewUrl: string;
  /** Feature bullet points shown on the portfolio card */
  features?: string[];
  /** Gradient start colour for the portfolio card header (hex) */
  accentFrom?: string;
  /** Gradient end colour for the portfolio card header (hex) */
  accentTo?: string;
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

// ─── Screenshot ────────────────────────────────────────────────────────────────

export interface ScreenshotResult {
  screenshotPath: string;
  thumbnailPath: string;
  width: number;
  height: number;
}

// ─── Pipeline State ────────────────────────────────────────────────────────────

export interface PublishPipelineState {
  config: DemoConfig;
  github?: GitHubRepoResult;
  vercel?: VercelProjectResult;
  deploymentUrl?: string;
  screenshot?: ScreenshotResult;
  thumbnailUrl?: string;
  portfolioUpdated?: boolean;
  completedAt?: string;
  errors: string[];
}
