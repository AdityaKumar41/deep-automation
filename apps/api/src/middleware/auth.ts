import { FastifyReply, FastifyRequest } from 'fastify';
import { clerkClient, getAuth } from '@clerk/fastify';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      userId: string;
      sessionId: string;
      orgId?: string;
      orgRole?: string;
    };
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { userId, sessionId, orgId, orgRole } = getAuth(request);

    if (!userId || !sessionId) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'You must be signed in to access this resource',
      });
    }

    // Attach auth info to request
    request.auth = {
      userId,
      sessionId,
      orgId: orgId || undefined,
      orgRole: orgRole || undefined,
    };
  } catch (error) {
    request.log.error(error);
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired session',
    });
  }
}

export async function requireOrganization(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await requireAuth(request, reply);

  if (reply.sent) return;

  if (!request.auth?.orgId) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'You must be part of an organization to access this resource',
    });
  }
}

export function requireRole(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireOrganization(request, reply);

    if (reply.sent) return;

    const userRole = request.auth?.orgRole;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        requiredRoles: allowedRoles,
        userRole,
      });
    }
  };
}
