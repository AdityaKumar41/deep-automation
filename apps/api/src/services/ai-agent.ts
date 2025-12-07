import { chatCompletion, ChatMessage } from './openai';
import { searchRepoAnalysis, searchChatHistory, findSimilarErrors } from './qdrant';
import { prisma } from '@evolvx/db';

export interface AgentContext {
  userId: string;
  organizationId?: string;
  projectId?: string;
  sessionId?: string;
}

export interface AgentResponse {
  content: string;
  action?: {
    type: 'ANALYZE_REPO' | 'DEPLOY_PROJECT' | 'SHOW_METRICS' | 'FIX_ERROR' | 'NONE';
    params?: any;
  };
  context?: any;
}

/**
 * Main AI Agent - processes user queries with context
 */
export async function processUserQuery(
  query: string,
  context: AgentContext
): Promise<AgentResponse> {
  const { userId, organizationId, projectId, sessionId } = context;

  // Detect intent
  const intent = await detectIntent(query);

  // Gather relevant context
  const relevantContext = await gatherContext(query, context);

  // Build system prompt
  const systemPrompt = buildSystemPrompt(intent, relevantContext);

  //Build conversation history
  const conversationHistory = sessionId
    ? await getConversationHistory(sessionId)
    : [];

  // Build messages
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: query },
  ];

  // Get AI response
  const response = await chatCompletion({
    messages,
    temperature: 0.7,
  });

  // Extract action if any
  const action = extractAction(response.content, intent);

  return {
    content: response.content,
    action,
    context: relevantContext,
  };
}

/**
 * Detect user intent from query
 */
async function detectIntent(query: string) {
  const lowerQuery = query.toLowerCase();

  if (
    lowerQuery.includes('deploy') ||
    lowerQuery.includes('build') ||
    lowerQuery.includes('release')
  ) {
    return 'DEPLOY';
  }

  if (
    lowerQuery.includes('analyze') ||
    lowerQuery.includes('repo') ||
    lowerQuery.includes('repository') ||
    lowerQuery.includes('understand')
  ) {
    return 'ANALYZE';
  }

  if (
    lowerQuery.includes('metric') ||
    lowerQuery.includes('performance') ||
    lowerQuery.includes('cpu') ||
    lowerQuery.includes('memory') ||
    lowerQuery.includes('traffic')
  ) {
    return 'METRICS';
  }

  if (
    lowerQuery.includes('error') ||
    lowerQuery.includes('fail') ||
    lowerQuery.includes('crash') ||
    lowerQuery.includes('fix')
  ) {
    return 'TROUBLESHOOT';
  }

  if (
    lowerQuery.includes('how') ||
    lowerQuery.includes('what') ||
    lowerQuery.includes('explain')
  ) {
    return 'EXPLAIN';
  }

  return 'GENERAL';
}

/**
 * Gather relevant context for the query
 */
async function gatherContext(query: string, context: AgentContext) {
  const { projectId, organizationId } = context;
  const relevantContext: any = {};

  // Get project info if projectId provided
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        deployments: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
        metrics: {
          orderBy: { timestamp: 'desc' },
          take: 100,
        },
      },
    });

    if (project) {
      relevantContext.project = {
        name: project.name,
        framework: project.framework,
        status: project.status,
        repoUrl: project.repoUrl,
        deploymentType: project.deploymentType,
      };

      relevantContext.recentDeployments = project.deployments.map((d: { version: string | null; status: string; startedAt: Date; errorMessage: string | null }) => ({
        version: d.version,
        status: d.status,
        startedAt: d.startedAt,
        error: d.errorMessage,
      }));

      // Check for recent errors
      const failedDeployment = project.deployments.find((d: { status: string }) => d.status === 'FAILED');
      if (failedDeployment && failedDeployment.errorMessage) {
        // Find similar errors
        const similarErrors = await findSimilarErrors(
          failedDeployment.errorMessage,
          projectId,
          3
        );
        if (similarErrors.length > 0) {
          relevantContext.similarErrors = similarErrors;
        }
      }
    }
  }

  // Search repository analysis for relevant info
  if (projectId) {
    const repoResults = await searchRepoAnalysis(query, [projectId], 3);
    if (repoResults.length > 0) {
      relevantContext.repoAnalysis = repoResults[0];
    }
  }

  // Search chat history for relevant context
  const chatResults = await searchChatHistory(query, context.sessionId, 5);
  if (chatResults.length > 0) {
    relevantContext.previousContext = chatResults
      .filter((r) => r.score > 0.8)
      .map((r) => r.content);
  }

  return relevantContext;
}

/**
 * Build system prompt based on intent and context
 */
function buildSystemPrompt(intent: string, context: any): string {
  let basePrompt = `You are Evolvx AI, an intelligent DevOps assistant. You help developers deploy, monitor, and troubleshoot their applications.

You have access to:
- Repository analysis and code understanding
- Deployment history and logs
- Performance metrics and monitoring data
- Error patterns and solutions

Be concise, helpful, and actionable. When suggesting commands or configurations, provide them in code blocks.`;

  if (context.project) {
    basePrompt += `\n\nCurrent Project: ${context.project.name}
Framework: ${context.project.framework || 'Unknown'}
Status: ${context.project.status}
Deployment Type: ${context.project.deploymentType}`;
  }

  if (context.repoAnalysis) {
    basePrompt += `\n\nRepository Analysis:\n${context.repoAnalysis.analysis}`;
  }

  if (context.recentDeployments && context.recentDeployments.length > 0) {
    basePrompt += `\n\nRecent Deployments:`;
    context.recentDeployments.forEach((d: any) => {
      basePrompt += `\n- ${d.version}: ${d.status}`;
      if (d.error) basePrompt += ` (Error: ${d.error})`;
    });
  }

  if (context.similarErrors && context.similarErrors.length > 0) {
    basePrompt += `\n\nSimilar Past Errors and Solutions:`;
    context.similarErrors.forEach((e: any, i: number) => {
      basePrompt += `\n${i + 1}. ${e.errorMessage}\n   Solution: ${e.solution}`;
    });
  }

  // Intent-specific additions
  if (intent === 'DEPLOY') {
    basePrompt += `\n\nThe user wants to deploy. Guide them through the deployment process or trigger it if they're ready.`;
  } else if (intent === 'TROUBLESHOOT') {
    basePrompt += `\n\nThe user is experiencing an issue. Help diagnose and provide solutions.`;
  } else if (intent === 'METRICS') {
    basePrompt += `\n\nThe user wants performance insights. Provide clear analysis of their metrics.`;
  }

  return basePrompt;
}

/**
 * Get conversation history
 */
async function getConversationHistory(sessionId: string): Promise<ChatMessage[]> {
  const messages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: 20, // Last 20 messages
  });

  return messages.map((m: { role: string; content: string }) => ({
    role: m.role.toLowerCase() as 'system' | 'user' | 'assistant',
    content: m.content,
  }));
}

/**
 * Extract actionable items from AI response
 */
function extractAction(
  content: string,
  intent: string
): AgentResponse['action'] {
  // Check if AI suggests deployment
  if (intent === 'DEPLOY' && (content.includes('deploy') || content.includes('ready'))) {
    return { type: 'DEPLOY_PROJECT' };
  }

  // Check if AI suggests repository analysis
  if (intent === 'ANALYZE' && content.includes('analyze')) {
    return { type: 'ANALYZE_REPO' };
  }

  // Check if AI wants to show metrics
  if (intent === 'METRICS') {
    return { type: 'SHOW_METRICS' };
  }

  // Check if AI suggests a fix
  if (intent === 'TROUBLESHOOT' && content.includes('fix')) {
    return { type: 'FIX_ERROR' };
  }

  return { type: 'NONE' };
}

/**
 * Generate deployment summary
 */
export async function generateDeploymentSummary(deploymentId: string) {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { project: true },
  });

  if (!deployment) {
    return 'Deployment not found';
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a deployment analyst. Summarize deployment results concisely.',
    },
    {
      role: 'user',
      content: `Summarize this deployment:
Project: ${deployment.project.name}
Status: ${deployment.status}
Logs: ${deployment.buildLogs || 'No logs'}
Error: ${deployment.errorMessage || 'None'}`,
    },
  ];

  const response = await chatCompletion({ messages, temperature: 0.3 });
  return response.content;
}

/**
 * Generate monitoring insights
 */
export async function generateMonitoringInsights(projectId: string) {
  const metrics = await prisma.metric.findMany({
    where: { projectId },
    orderBy: { timestamp: 'desc' },
    take: 100,
  });

  if (metrics.length === 0) {
    return 'No metrics available yet';
  }

  // Calculate basic stats
  const cpuMetrics = metrics.filter((m: { type: string }) => m.type === 'CPU_USAGE');
  const memMetrics = metrics.filter((m: { type: string }) => m.type === 'MEMORY_USAGE');

  const avgCpu = cpuMetrics.reduce((sum: number, m: { value: number }) => sum + m.value, 0) / cpuMetrics.length;
  const avgMem = memMetrics.reduce((sum: number, m: { value: number }) => sum + m.value, 0) / memMetrics.length;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a performance analyst. Provide insights on application performance.',
    },
    {
      role: 'user',
      content: `Analyze these metrics:
Average CPU: ${avgCpu.toFixed(2)}%
Average Memory: ${avgMem.toFixed(2)}%
Total data points: ${metrics.length}
Time range: ${new Date(metrics[metrics.length - 1].timestamp).toLocaleString()} to ${new Date(metrics[0].timestamp).toLocaleString()}`,
    },
  ];

  const response = await chatCompletion({ messages, temperature: 0.4 });
  return response.content;
}
