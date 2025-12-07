import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { McpClient, SlackNotifyTool, SlackNotifySchema } from '@evolvx/mcp';

export default async function mcpRoutes(fastify: FastifyInstance) {
  // Initialize MCP client
  const mcpClient = new McpClient();
  
  // Register local tools
  // In a real scenario, this might connect to remote MCP servers
  mcpClient.registerTool('local', SlackNotifyTool);

  // Send a notification via MCP Tool
  fastify.post<{
    Body: {
      webhookUrl: string;
      message: string;
      channel?: string;
      username?: string;
    }
  }>(
    '/mcp/notify',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { webhookUrl, message, channel, username } = request.body;
      
      try {
        // Use the MCP Client to call the tool
        const result = await mcpClient.callTool('local', 'slack_notify', {
          webhookUrl,
          message,
          channel,
          username
        });

        if (!result.success) {
          return reply.code(400).send({ error: result.error });
        }

        return { success: true, daa: result };
      } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({ error: error.message });
      }
    }
  );

  // List available tools
  fastify.get(
    '/mcp/tools',
    { preHandler: requireAuth },
    async (request, reply) => {
      const tools = mcpClient.listTools('local');
      return { tools };
    }
  );
}
