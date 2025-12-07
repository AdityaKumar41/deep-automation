import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@evolvx/db';
import { routeIntent } from '../services/ai/router';
import { dispatchAction } from '../services/ai/dispatcher';

const chatSchema = z.object({
  projectId: z.string(),
  message: z.string(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })).optional()
});

const aiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/chat', async (request, reply) => {
    // Verify auth
    const userId = request.auth?.userId;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const body = chatSchema.parse(request.body);
    const { projectId, message } = body;

    // Check project access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organization: {
          members: {
            some: { userId }
          }
        }
      }
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found or access denied' });
    }

    try {
      // 1. Route Intent
      const context = { userId, projectId, organizationId: project.organizationId };
      const intent = await routeIntent(message, context);
      
      request.log.info({ intent }, 'AI Intent Detected');

      // 2. Dispatch Action
      const result = await dispatchAction(intent, message, context);

      return {
        answer: result.content,
        action: result.action,
        intent: intent.type
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to process AI request' });
    }
  });
};

export default aiRoutes;
