/**
 * Vercel Service
 *
 * Handles:
 *   - Creating a Vercel project (if it doesn't exist)
 *   - Linking the Vercel project to the GitHub repo
 *   - Triggering a deployment
 *   - Polling for deployment success (used during manual publish flow)
 *
 * Uses the Vercel REST API v9 via axios.
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
    params, // Team ID automatically appended to every request when set
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

  // Try fetching an existing project by name
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
    if ((err as { response?: { status?: number } }).response?.status !== 404) {
      throw err;
    }
  }

  logger.info(`[Vercel] Creating project: ${vercelProjectName}`);

  let data: { id: string; name: string };
  try {
    ({ data } = await client.post('/v10/projects', {
      name: vercelProjectName,
      framework: null, // null = no framework (plain HTML)
      gitRepository: {
        type: 'github',
        repo: `${githubOwner}/${repoName}`,
      },
    }));
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: unknown; status?: number } };
    if (axiosErr.response) {
      logger.error(`[Vercel] API error ${axiosErr.response.status}: ${JSON.stringify(axiosErr.response.data)}`);
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

/**
 * Triggers a new deployment on the connected Vercel project by
 * pushing a GitHub deploy hook or using the Vercel Deployments API.
 *
 * Vercel auto-deploys from the GitHub integration on every push,
 * so this is only needed when the push doesn't automatically trigger one.
 */
export async function triggerDeployment(
  projectId: string,
  repoName: string,
  githubOwner: string
): Promise<string> {
  const client = getVercelClient();

  logger.info(`[Vercel] Triggering deployment for project ${projectId}`);

  const { data } = await client.post('/v13/deployments', {
    name: repoName,
    gitSource: {
      type: 'github',
      repoId: null, // Let Vercel resolve via project link
      ref: 'main',
      org: githubOwner,
      repo: repoName,
    },
    projectId,
  });

  const deploymentUrl = `https://${data.url}`;
  logger.info(`[Vercel] Deployment queued: ${deploymentUrl}`);
  return deploymentUrl;
}

/**
 * Polls the Vercel API until the deployment reaches a terminal state.
 * Used for local validation after `publish-demo` to confirm success.
 *
 * @param deploymentId  The Vercel deployment ID (e.g. "dpl_xxxx")
 * @param maxWaitMs     Maximum time to wait (default 5 minutes)
 */
export async function pollDeploymentUntilReady(
  deploymentId: string,
  maxWaitMs = 5 * 60 * 1000
): Promise<'READY' | 'ERROR' | 'CANCELED'> {
  const client = getVercelClient();
  const intervalMs = 10_000; // Poll every 10 seconds
  const start = Date.now();

  logger.info(`[Vercel] Polling deployment ${deploymentId}...`);

  while (Date.now() - start < maxWaitMs) {
    const { data } = await client.get(`/v13/deployments/${deploymentId}`);
    const state: string = data.readyState;

    logger.info(`[Vercel] Deployment state: ${state}`);

    if (state === 'READY' || state === 'ERROR' || state === 'CANCELED') {
      return state as 'READY' | 'ERROR' | 'CANCELED';
    }

    await sleep(intervalMs);
  }

  throw new Error(`Deployment ${deploymentId} did not complete within ${maxWaitMs / 1000}s`);
}

/**
 * Waits for the most recent Vercel deployment (triggered after `since`) to
 * reach a terminal state, then returns its live URL.
 *
 * Call this immediately after `triggerDeployCommit` — pass `Date.now()` captured
 * just before the commit push so we don't accidentally pick up a stale deployment.
 *
 * @param projectId   Vercel project ID (from ensureVercelProject)
 * @param projectName Used in log messages only
 * @param since       Unix ms timestamp — only look for deployments created after this
 * @param maxWaitMs   Maximum total wait time (default: 10 minutes)
 * @returns           Live deployment URL (https://...)
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

  // Phase 1: Find the deployment ID — Vercel queues it asynchronously after the push
  let deploymentId: string | null = null;

  while (Date.now() - start < maxWaitMs) {
    const { data } = await client.get('/v6/deployments', {
      params: {
        projectId,
        limit: 5,
        since: since - 10_000, // 10s grace period for clock skew
      },
    });

    if (data.deployments?.length > 0) {
      const latest = data.deployments[0];
      deploymentId = latest.uid;
      logger.info(`[Vercel] Deployment found: ${deploymentId} (state: ${latest.readyState})`);
      break;
    }

    logger.info('[Vercel] Deployment not yet queued — retrying in 10s...');
    await sleep(pollInterval);
  }

  if (!deploymentId) {
    throw new Error(
      `No deployment appeared for project "${projectName}" within ${maxWaitMs / 1000}s`
    );
  }

  // Phase 2: Poll until READY (or fail fast on ERROR/CANCELED)
  while (Date.now() - start < maxWaitMs) {
    const { data } = await client.get(`/v13/deployments/${deploymentId}`);
    const state: string = data.readyState;

    logger.info(`[Vercel] Deployment state: ${state}`);

    if (state === 'READY') {
      const url = `https://${data.url}`;
      logger.info(`[Vercel] Deployment ready → ${url}`);
      return url;
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
