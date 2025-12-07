import { z } from 'zod';

export interface McpTool {
  name: string;
  description: string;
  schema: z.ZodType<any>;
  execute: (args: any) => Promise<any>;
}

export interface McpServer {
  name: string;
  tools: Map<string, McpTool>;
}

export interface McpConfig {
  servers: Record<string, ServerConfig>;
}

export interface ServerConfig {
  type: 'local' | 'http' | 'stdio';
  endpoint?: string;
  command?: string;
  env?: Record<string, string>;
}
