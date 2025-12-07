import { FastifyPluginAsync } from "fastify";
import { prisma } from "@evolvx/db";
import { requireAuth } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  sendMessageSchema,
  createChatSessionSchema,
  idParamSchema,
} from "@evolvx/shared";
import { processUserQuery } from "../services/ai-agent";
import { storeChatMessage } from "../services/qdrant";
import { chatCompletionStream } from "../services/openai";

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  // Create chat session
  fastify.post(
    "/sessions",
    {
      preHandler: [requireAuth, validateBody(createChatSessionSchema)],
    },
    async (request, reply) => {
      const { projectId } = request.body as any;
      const userId = request.auth!.userId;
      const organizationId = request.auth!.orgId;

      if (!organizationId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Organization context required",
        });
      }

      // Get user from database
      const dbUser = await prisma.user.findUnique({
        where: { clerkUserId: userId },
      });

      if (!dbUser) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "User not found in database",
        });
      }

      // Create session
      const session = await prisma.chatSession.create({
        data: {
          organizationId,
          userId: dbUser.id,
          projectId,
        },
      });

      return { session };
    }
  );

  // Get chat sessions
  fastify.get(
    "/sessions",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.auth!.userId;
      const organizationId = request.auth!.orgId;

      // Get user from database
      const dbUser = await prisma.user.findUnique({
        where: { clerkUserId: userId },
      });

      if (!dbUser) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "User not found in database",
        });
      }

      const sessions = await prisma.chatSession.findMany({
        where: {
          userId: dbUser.id,
          organizationId,
        },
        include: {
          _count: {
            select: { messages: true },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      return { sessions };
    }
  );

  // Get session messages
  fastify.get(
    "/sessions/:id/messages",
    {
      preHandler: [requireAuth, validateQuery(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Get user from database
      const dbUser = await prisma.user.findUnique({
        where: { clerkUserId: request.auth!.userId },
      });

      if (!dbUser) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "User not found in database",
        });
      }

      const session = await prisma.chatSession.findUnique({
        where: { id },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!session) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Chat session not found",
        });
      }

      // Verify access
      if (session.userId !== dbUser.id) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "You do not have access to this chat session",
        });
      }

      return { messages: session.messages };
    }
  );

  // Send message (with streaming support)
  fastify.post(
    "/message",
    {
      preHandler: [requireAuth, validateBody(sendMessageSchema)],
    },
    async (request, reply) => {
      const { sessionId, message, projectId } = request.body as any;
      const userId = request.auth!.userId;
      const organizationId = request.auth!.orgId;

      // Get or create session
      let session;
      if (sessionId) {
        session = await prisma.chatSession.findUnique({
          where: { id: sessionId },
        });

        if (!session || session.userId !== userId) {
          return reply.code(404).send({
            error: "Not Found",
            message: "Chat session not found or access denied",
          });
        }
      } else {
        // Create new session
        session = await prisma.chatSession.create({
          data: {
            organizationId: organizationId || "",
            userId,
            projectId,
          },
        });
      }

      // Store user message
      const userMessage = await prisma.message.create({
        data: {
          sessionId: session.id,
          role: "USER",
          content: message,
        },
      });

      // Store in Qdrant for RAG
      await storeChatMessage({
        messageId: userMessage.id,
        sessionId: session.id,
        projectId: projectId || undefined,
        role: "USER",
        content: message,
      });

      // Process with AI agent
      const agentResponse = await processUserQuery(message, {
        userId,
        organizationId,
        projectId,
        sessionId: session.id,
      });

      // Store assistant message
      const assistantMessage = await prisma.message.create({
        data: {
          sessionId: session.id,
          role: "ASSISTANT",
          content: agentResponse.content,
          metadata: {
            action: agentResponse.action,
            context: agentResponse.context,
          },
        },
      });

      // Store in Qdrant
      await storeChatMessage({
        messageId: assistantMessage.id,
        sessionId: session.id,
        projectId: projectId || undefined,
        role: "ASSISTANT",
        content: agentResponse.content,
      });

      return {
        sessionId: session.id,
        userMessage,
        assistantMessage,
        action: agentResponse.action,
      };
    }
  );

  // Stream message (for real-time responses)
  fastify.post(
    "/message/stream",
    {
      preHandler: [requireAuth, validateBody(sendMessageSchema)],
    },
    async (request, reply) => {
      const { sessionId, message, projectId } = request.body as any;
      const userId = request.auth!.userId;
      const organizationId = request.auth!.orgId;

      // Get or create session
      let session;
      if (sessionId) {
        session = await prisma.chatSession.findUnique({
          where: { id: sessionId },
        });

        if (!session || session.userId !== userId) {
          return reply.code(404).send({
            error: "Not Found",
            message: "Chat session not found",
          });
        }
      } else {
        session = await prisma.chatSession.create({
          data: {
            organizationId: organizationId || "",
            userId,
            projectId,
          },
        });
      }

      // Store user message
      await prisma.message.create({
        data: {
          sessionId: session.id,
          role: "USER",
          content: message,
        },
      });

      // Get conversation history
      const history = await prisma.message.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "asc" },
        take: 20,
      });

      const messages = history.map((m: { role: string; content: string }) => ({
        role: m.role.toLowerCase() as "system" | "user" | "assistant",
        content: m.content,
      }));

      messages.push({ role: "user", content: message });

      // Create stream
      const stream = await chatCompletionStream({ messages });

      // Set headers for SSE
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Pipe stream to response
      return reply.send(stream);
    }
  );

  // Delete chat session
  fastify.delete(
    "/sessions/:id",
    {
      preHandler: [requireAuth, validateQuery(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const session = await prisma.chatSession.findUnique({
        where: { id },
      });

      if (!session || session.userId !== request.auth!.userId) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Chat session not found",
        });
      }

      await prisma.chatSession.delete({
        where: { id },
      });

      return { success: true, message: "Chat session deleted" };
    }
  );
};

export default chatRoutes;
