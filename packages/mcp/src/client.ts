import axios from 'axios';
import { McpServer, McpTool, McpConfig } from './types';

export class McpClient {
  private servers: Map<string, McpServer> = new Map();

  constructor(config?: McpConfig) {
    if (config) {
      this.initialize(config);
    }
  }

  private initialize(config: McpConfig) {
    // Initialize connection to servers
    // For now, we support local tools primarily
  }

  registerTool(serverName: string, tool: McpTool) {
    let server = this.servers.get(serverName);
    if (!server) {
      server = { name: serverName, tools: new Map() };
      this.servers.set(serverName, server);
    }
    server.tools.set(tool.name, tool);
  }

  async callTool(serverName: string, toolName: string, args: any) {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    const tool = server.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found on server ${serverName}`);
    }

    // Validate args
    const parsedArgs = tool.schema.parse(args);
    return await tool.execute(parsedArgs);
  }

  listTools(serverName: string) {
    const server = this.servers.get(serverName);
    if (!server) return [];
    return Array.from(server.tools.values()).map(t => ({
      name: t.name,
      description: t.description
    }));
  }
}
