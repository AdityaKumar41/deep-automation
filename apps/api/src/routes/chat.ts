import { FastifyPluginAsync } from "fastify";
import { prisma } from "@evolvx/db";
import { requireAuth } from "../middleware/auth";
import { validateBody, validateQuery, validateParams } from "../middleware/validate";
import {
  sendMessageSchema,
  createChatSessionSchema,
  idParamSchema,
} from "@evolvx/shared";
import { processUserQuery } from "../services/ai-agent";
import { storeChatMessage } from "../services/qdrant";
import { chatCompletionStream } from "../services/openai";

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  // Get latest session for a project
  fastify.get(
    "/project/:id/session",
    {
      preHandler: [requireAuth, validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const projectId = id;
      const userId = request.auth!.userId;
      
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

      // Find latest session for this project
      const session = await prisma.chatSession.findFirst({
        where: {
          projectId,
          userId: dbUser.id,
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          }
        }
      });

      if (!session) {
        return { messages: [] };
      }

      return { session };
    }
  );

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

      if (!organizationId && projectId) {
        // Try to fetch project to get organizationId
        const project = await prisma.project.findUnique({
             where: { id: projectId },
             select: { organizationId: true }
        });
        if (project) {
            // We can assign to the variable since we need it for creation
            // However, arguments are const, so we might need a let variable or just use project.organizationId
             // But let's check if we can just re-assign or if we need a new variable.
             // Using a new variable is cleaner.
        } else {
             return reply.code(400).send({
                error: "Bad Request",
                message: "Project not found and no organization context provided",
              });
        }
      }

      if (!organizationId && !projectId) {
         return reply.code(400).send({
          error: "Bad Request",
          message: "Organization context required",
        });
      }
      
      const paramOrgId = organizationId || (await prisma.project.findUnique({where: {id: projectId}, select: {organizationId: true}}))?.organizationId;

      if (!paramOrgId) {
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
          organizationId: paramOrgId,
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
      console.log('📨 /messages/stream request received');
      const { sessionId, projectId, message } = request.body as any;
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

  // Handle OPTIONS preflight for streaming
  fastify.options("/messages/stream", async (request, reply) => {
    reply
      .code(200)
      .header("Access-Control-Allow-Origin", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
      .header("Access-Control-Allow-Methods", "POST, OPTIONS")
      .header("Access-Control-Allow-Headers", "Content-Type, Authorization")
      .header("Access-Control-Allow-Credentials", "true")
      .send();
  });

  // Stream message (for real-time responses)
  fastify.post(
    "/messages/stream",
    {
      config: {
        // Disable helmet for this route to allow custom headers
        helmet: false,
      },
    },
    async (request, reply) => {
      console.log('🔥 /messages/stream POST RECEIVED', { body: request.body, query: request.query });
      // 1. Perform Auth Check BEFORE sending headers
      try {
        await requireAuth(request, reply);
      } catch (authError) {
        // Auth failed - reply may already be sent by requireAuth
        if (reply.sent) return;
        return reply.code(401).send({ error: "Unauthorized", message: "Please sign in" });
      }

      // Check if requireAuth already sent a response
      if (reply.sent) return;

      const clerkUserId = request.auth?.userId;
      const organizationId = request.auth?.orgId;

      if (!clerkUserId) {
        return reply.code(401).send({ error: "Unauthorized", message: "Please sign in" });
      }

      // Lookup internal User ID
      const dbUser = await prisma.user.findUnique({
        where: { clerkUserId },
        select: { id: true }
      });

      if (!dbUser) {
           return reply.code(400).send({ error: "User not found", message: "User account not synced" });
      }
      
      const userId = dbUser.id;

      // 2. Set CORS / SSE Headers
      reply.raw.writeHead(200, {
        "Access-Control-Allow-Origin": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "Access-Control-Allow-Credentials": "true",
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const { content, projectId } = request.body as any;
      // userId and organizationId are already extracted above

      // Resolve Organization ID if missing
      let finalOrgId = organizationId;
      if (!finalOrgId && projectId) {
         const project = await prisma.project.findUnique({
             where: { id: projectId },
             select: { organizationId: true }
         });
         if (project) {
             finalOrgId = project.organizationId;
         }
      }

      if (!finalOrgId) {
          reply.raw.write(`data: ${JSON.stringify({ error: "Organization context required. Please select a project or organization." })}\n\n`);
          reply.raw.end();
          return;
      }

      if (!content) {
        reply.raw.write(`data: ${JSON.stringify({ error: "Content is required" })}\n\n`);
        reply.raw.end();
        return;
      }

      try {
        // Get or create session for this project
        let session = await prisma.chatSession.findFirst({
          where: {
            userId,
            projectId: projectId || null,
          },
          orderBy: { createdAt: "desc" },
        });

        if (!session) {
          session = await prisma.chatSession.create({
            data: {
              organizationId: finalOrgId,
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
            content,
          },
        });

        // Process query with AI agent to get context
        const { processUserQuery } = await import("../services/ai-agent");
        console.log('🤖 Processing user query with AI agent', { projectId, hasProjectId: !!projectId });
        let agentResponse = await processUserQuery(content, {
          userId,
          organizationId: finalOrgId,
          projectId,
          sessionId: session.id,
        });
        console.log('✅ Agent response received', { 
          hasContext: !!agentResponse.context,
          hasRepoAnalysis: !!agentResponse.context?.repoAnalysis,
          action: agentResponse.action?.type
        });

        // Handle ANALYZE_REPO action - fetch project and run fresh analysis
        if (agentResponse.action?.type === 'ANALYZE_REPO' && projectId) {
          console.log('🔄 Running fresh repository analysis...');
          const project = await prisma.project.findUnique({
            where: { id: projectId },
          });
          
          if (project?.repoUrl) {
            try {
              const { analyzeAndStore } = await import("../services/repo-analyzer");
              const freshAnalysis = await analyzeAndStore(
                projectId, 
                project.repoUrl
              );
              // Inject fresh analysis into context
              agentResponse.context = agentResponse.context || {};
              agentResponse.context.repoAnalysis = {
                framework: freshAnalysis.framework,
                dependencies: freshAnalysis.dependencies,
                analysis: freshAnalysis.analysis,
              };
              agentResponse.context.project = {
                name: project.name,
                framework: freshAnalysis.framework,
                status: project.status,
                deploymentType: project.deploymentType,
              };
              console.log('✅ Fresh analysis complete and injected');
            } catch (analysisError: any) {
              console.error('❌ Fresh analysis failed:', analysisError.message);
            }
          }
        }

        // Stream the response using AI SDK
        const { chatCompletionStream } = await import("../services/openai");
        
        // Get conversation history (exclude the message we just saved)
        const history = await prisma.message.findMany({
          where: { 
            sessionId: session.id,
            id: { not: userMessage.id } // Exclude current message
          },
          orderBy: { createdAt: "asc" },
          take: 20,
        });

        // Build messages array with enhanced context from agent
        // Build comprehensive system prompt using context gathered by AI agent
        let systemPrompt = `You are Evolvx AI, a Senior SRE and DevOps Engineer acting as a core specialized agent within the Evolvx Platform.
Your goal is to autonomously assist developers in achieving production excellence. You do not just answer questions; you provide concrete engineering solutions.

**Core Capabilities & Behaviors**:
1. **CI/CD Expert**: If asked about CI/CD, always propose a complete, valid 'github-actions' YAML workflow specific to their framework.
2. **Infrastructure-as-Code**: Provide Dockerfiles optimized for production (multi-stage builds, alpine images). Suggest Kubernetes manifests or Helm charts if scaling is mentioned.
3. **Proactive SRE**: When looking at metrics, look for anomalies. Suggest auto-scaling rules if CPU > 70%. Suggest implementing alerts for error rate spikes.
4. **Root Cause Analysis**: When debugging, correlate the specific error in logs with the repository code context. Suggest exact code fixes or config changes.

**Tone**: Professional, Technical, authoritative but helpful using "we" (as a partner engineer).
**Output Format**: Use Markdown. Always put code/config in code blocks with language tags (yaml, dockerfile, bash).`;

        // Add project context if available
        if (agentResponse.context?.project) {
          const proj = agentResponse.context.project;
          systemPrompt += `\n\n**Current Context**\nProject: ${proj.name}\nFramework: ${proj.framework || 'Unknown'}\nStatus: ${proj.status}\nDeployment Type: ${proj.deploymentType}`;
        }

        // Add full repository analysis if available
        if (agentResponse.context?.repoAnalysis) {
          const repo = agentResponse.context.repoAnalysis;
          systemPrompt += `\n\n**Repository Intelligence**:\nFramework: ${repo.framework}\nDependencies: ${repo.dependencies?.slice(0, 20).join(', ')}${(repo.dependencies?.length || 0) > 20 ? '...' : ''}\n\nAnalysis:\n${repo.analysis}`;
          console.log('✅ Repo analysis injected into system prompt');
        } else {
          console.log('⚠️ No repo analysis found in agent context');
        }

        // Add deployment history if available
        if (agentResponse.context?.recentDeployments && agentResponse.context.recentDeployments.length > 0) {
          systemPrompt += `\n\n**Recent Deployments**:`;
          agentResponse.context.recentDeployments.forEach((d: any) => {
            systemPrompt += `\n- ${d.version || 'latest'}: ${d.status}`;
            if (d.error) systemPrompt += ` (Error: ${d.error})`;
          });
        }

        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...history.map((m) => ({
            role: m.role.toLowerCase() as "system" | "user" | "assistant",
            content: m.content,
          })),
          { role: "user" as const, content }
        ];

        const stream = await chatCompletionStream({ messages });

        let fullContent = "";

        // Stream to client
        for await (const chunk of stream) {
          fullContent += chunk;
          const data = JSON.stringify({ content: chunk });
          reply.raw.write(`data: ${data}\n\n`);
        }

        // Send done signal
        reply.raw.write(`data: [DONE]\n\n`);

        // Perform background storage tasks (don't fail the stream if these fail)
        try {
            // Store assistant message
            const assistantMsg = await prisma.message.create({
              data: {
                sessionId: session.id,
                role: "ASSISTANT",
                content: fullContent,
              },
            });

            // Store in Qdrant for context
            const { storeChatMessage } = await import("../services/qdrant");
            
            // Store User Message in Qdrant
            await storeChatMessage({
              messageId: userMessage.id,
              sessionId: session.id,
              projectId,
              role: "user",
              content,
            }).catch(e => fastify.log.error("Failed to store user message in Qdrant:", e));

            // Store Assistant Message in Qdrant (Added missing step)
            await storeChatMessage({
              messageId: assistantMsg.id,
              sessionId: session.id,
              projectId,
              role: "assistant",
              content: fullContent,
            }).catch(e => fastify.log.error("Failed to store assistant message in Qdrant:", e));

        } catch (storageError) {
             fastify.log.error({ err: storageError }, "Post-stream storage error");
             // Do not send error to client as stream is done
        }

        reply.raw.end();
      } catch (error: any) {
        fastify.log.error("Stream error:", error);
        // Only write error if we haven't sent DONE yet (approximate check)
        // Ideally we check if headers sent or if done sent.
        // For now, simple try/catch around the whole block is fine, checking if response is writable.
        if (!reply.raw.writableEnded) {
             reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
             reply.raw.end();
        }
      }
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
