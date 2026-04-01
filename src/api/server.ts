/**
 * Express Webhook Server
 *
 * Listens for incoming webhook events from Vercel.
 * Must be deployed publicly (e.g. Railway, Render, Fly.io) so Vercel can reach it.
 *
 * IMPORTANT: We use express.raw() on the webhook route so the raw body bytes
 * are available for HMAC signature verification. JSON parsing happens inside
 * the route handler after verification.
 */

import express from 'express';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { webhookRouter } from './routes/vercel-webhook';

const app = express();

// ─── Global Middleware ─────────────────────────────────────────────────────────

// Parse JSON for all routes EXCEPT the webhook route (needs raw body for HMAC)
app.use((req, res, next) => {
  if (req.path === '/api/vercel-webhook') {
    // Raw body needed for signature verification
    express.raw({ type: '*/*' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check — used by the hosting provider to confirm the server is alive
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'brandlifters-automation', time: new Date().toISOString() });
});

// Webhook routes
app.use('/api', webhookRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`[Server] Unhandled error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const port = parseInt(env.PORT, 10);

app.listen(port, () => {
  logger.info(`BrandLifters webhook server running on port ${port}`);
  logger.info(`Health check: http://localhost:${port}/health`);
  logger.info(`Webhook endpoint: http://localhost:${port}/api/vercel-webhook`);
});

export default app;
