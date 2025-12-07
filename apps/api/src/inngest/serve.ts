import { serve } from 'inngest/fastify';
import { inngest } from './client';
import { functions } from './functions';

/**
 * Inngest serve handler for Fastify
 */
export const inngestHandler = serve({
  client: inngest,
  functions,
  serveHost: process.env.INNGEST_SERVE_HOST,
  servePath: '/api/inngest',
});
