/**
 * Vercel Service
 *
 * Handles:
 *   - Creating a Vercel project linked to a GitHub repo
 *   - Polling for deployment completion
 *   - Returning the correct public production URL
 */

import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { DemoConfig, VercelProjectResult } from '../types';

// ─── API Client ────────────────────────────────────────────────────────────────

function getVercelClient(): AxiosInstance {
  const params: Record<string, string> = {};
  if (env.VERCEL_TEAM_ID) params.teamId = env.VERCEL_TEAM_ID;

  return axios.create({
    baseURL: 'https://api.vercel.com',
    headers: {
      Authorization: `Bearer ${env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    params,
  });
}

// ─── Project Management ────────────────────────────────────────────────────────

/**
 * Creates a Vercel project and links it to the GitHub repo.
 * If the project already exists, returns its metadata unchanged.
 */
export async function ensureVercelProject(
  config: DemoConfig,
  githubOwner: string
): Promise<VercelProjectResult> {
  const client = getVercelClient();
  const { vercelProjectName, repoName } = config;

  logger.info(`[Vercel] Checking for project: ${vercelProjectName}`);

  try {
    const { data } = await client.get(`/v9/projects/${vercelProjectName}`);
    logger.info(`[Vercel] Project already exists: ${data.id}`);
    return {
      projectId: data.id,
      projectName: data.name,
      deploymentUrl: null,
      alreadyExisted: true,
    };
  } catch (err: unknown) {
    if ((err as { response?: { status?: number } }).response?.status !== 404) throw err;
  }

  logger.info(`[Vercel] Creating project: ${vercelProjectName}`);

  let data: { id: string; name: string };
  try {
    ({ data } = await client.post('/v10/projects', {
      name: vercelProjectName,
      framework: null,
      gitRepository: {
        type: 'github',
        repo: `${githubOwner}/${repoName}`,
      },
    }));
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: unknown; status?: number } };
    if (axiosErr.response) {
      logger.error(
        `[Vercel] API error ${axiosErr.response.status}: ${JSON.stringify(axiosErr.response.data)}`
      );
    }
    throw err;
  }

  logger.info(`[Vercel] Project created: ${data.id}`);
  return {
    projectId: data.id,
    projectName: data.name,
    deploymentUrl: null,
    alreadyExisted: false,
  };
}

// ─── Deployment Polling ────────────────────────────────────────────────────────

/**
 * Waits for the most recent deployment (after `since`) to reach READY,
 * then returns the correct public production URL.
 *
 * URL resolution order:
 *   1. Alias ending in `.vercel.app` from the deployment's alias list
 *   2. The project's production domain from /v9/projects (most reliable)
 *   3. Fallback: construct `https://<projectName>.vercel.app`
 *
 * @param projectId   Vercel project ID (from ensureVercelProject)
 * @param projectName Vercel project name (used for fallback URL + logs)
 * @param since       Unix ms — only look for deployments created after this
 * @param maxWaitMs   Maximum total wait (default: 10 minutes)
 */
export async function waitForDeployment(
  projectId: string,
  projectName: string,
  since: number,
  maxWaitMs = 10 * 60 * 1000
): Promise<string> {
  const client = getVercelClient();
  const pollInterval = 10_000;
  const start = Date.now();

  logger.info(`[Vercel] Waiting for deployment of: ${projectName}`);

  // Phase 1: Find the deployment that was triggered after `since`
  let deploymentId: string | null = null;

  while (Date.now() - start < maxWaitMs) {
    const { data } = await client.get('/v6/deployments', {
      params: {
        projectId,
        limit: 5,
        since: since - 15_000, // 15s grace for clock skew
      },
    });

    if (data.deployments?.length > 0) {
      // Pick the newest deployment created at or after our trigger time
      const candidates = (data.deployments as Array<{ uid: string; created: number; readyState: string }>)
        .filter((d) => d.created >= since - 15_000)
        .sort((a, b) => b.created - a.created);

      if (candidates.length > 0) {
        deploymentId = candidates[0].uid;
        logger.info(
          `[Vercel] Deployment found: ${deploymentId} (state: ${candidates[0].readyState})`
        );
        break;
      }
    }

    logger.info('[Vercel] Deployment not yet queued — retrying in 10s...');
    await sleep(pollInterval);
  }

  if (!deploymentId) {
    throw new Error(
      `No deployment appeared for project "${projectName}" within ${maxWaitMs / 1000}s`
    );
  }

  // Phase 2: Poll until READY
  while (Date.now() - start < maxWaitMs) {
    const { data } = await client.get(`/v13/deployments/${deploymentId}`);
    const state: string = data.readyState;

    logger.info(`[Vercel] Deployment state: ${state}`);

    if (state === 'READY') {
      return resolveProductionUrl(client, projectId, projectName, data);
    }

    if (state === 'ERROR' || state === 'CANCELED') {
      throw new Error(`Deployment ${deploymentId} ended with state: ${state}`);
    }

    await sleep(pollInterval);
  }

  throw new Error(
    `Deployment ${deploymentId} did not finish within ${maxWaitMs / 1000}s`
  );
}

// ─── URL Resolution ────────────────────────────────────────────────────────────

/**
 * Resolves the correct public URL for a READY deployment.
 *
 * Vercel preview URLs (data.url) are behind auth on Hobby plans.
 * We need the production alias — `.vercel.app` or a custom domain.
 */
async function resolveProductionUrl(
  client: AxiosInstance,
  projectId: string,
  projectName: string,
  deploymentData: Record<string, unknown>
): Promise<string> {
  // 1. Check aliases on the deployment itself
  const aliases: string[] = Array.isArray(deploymentData.alias)
    ? (deploymentData.alias as string[])
    : [];

  const vercelAppAlias = aliases.find((a) => a.endsWith('.vercel.app'));
  if (vercelAppAlias) {
    const url = `https://${vercelAppAlias}`;
    logger.info(`[Vercel] Deployment ready → ${url} (from deployment alias)`);
    return url;
  }

  // 2. Query project domains for the production alias (most reliable source)
  try {
    const { data } = await client.get(`/v9/projects/${projectId}/domains`);
    const domains: Array<{ name: string; verified: boolean; redirect?: string }> =
      data.domains ?? [];

    // Prefer the canonical .vercel.app production domain
    const productionDomain =
      domains.find((d) => d.name.endsWith('.vercel.app') && !d.redirect) ??
      domains.find((d) => !d.redirect && d.verified);

    if (productionDomain) {
      const url = `https://${productionDomain.name}`;
      logger.info(`[Vercel] Deployment ready → ${url} (from project domains)`);
      return url;
    }
  } catch {
    logger.warn('[Vercel] Could not fetch project domains — using fallback URL');
  }

  // 3. Fallback: construct from project name (every Vercel project gets this alias)
  const fallback = `https://${projectName}.vercel.app`;
  logger.info(`[Vercel] Deployment ready → ${fallback} (fallback)`);
  return fallback;
}

// ─── Production URL Lookup ─────────────────────────────────────────────────────

/**
 * Returns the current production URL for an already-deployed Vercel project
 * without triggering a new deployment.
 *
 * Resolution order:
 *   1. `.vercel.app` domain from project domains API (canonical, no redirect)
 *   2. Any other verified non-redirect domain
 *   3. Fallback: `https://<vercelProjectName>.vercel.app`
 */
export async function getProjectProductionUrl(vercelProjectName: string): Promise<string> {
  const client = getVercelClient();

  logger.info(`[Vercel] Fetching production URL for: ${vercelProjectName}`);

  let projectId: string = vercelProjectName;
  try {
    const { data } = await client.get(`/v9/projects/${vercelProjectName}`);
    projectId = data.id;
  } catch {
    logger.warn(`[Vercel] Could not fetch project metadata — using name as ID`);
  }

  try {
    const { data } = await client.get(`/v9/projects/${projectId}/domains`);
    const domains: Array<{ name: string; verified: boolean; redirect?: string }> =
      data.domains ?? [];

    const productionDomain =
      domains.find((d) => d.name.endsWith('.vercel.app') && !d.redirect) ??
      domains.find((d) => !d.redirect && d.verified);

    if (productionDomain) {
      const url = `https://${productionDomain.name}`;
      logger.info(`[Vercel] Production URL: ${url}`);
      return url;
    }
  } catch {
    logger.warn('[Vercel] Could not fetch project domains — using fallback URL');
  }

  const fallback = `https://${vercelProjectName}.vercel.app`;
  logger.info(`[Vercel] Production URL (fallback): ${fallback}`);
  return fallback;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
