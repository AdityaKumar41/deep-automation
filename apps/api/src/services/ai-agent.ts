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

  console.log(`🤖 AI Agent processing query: "${query}"`, {
    hasProjectId: !!projectId,
    projectId,
    hasSessionId: !!sessionId,
    sessionId
  });

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
    lowerQuery.includes('release') ||
    lowerQuery.includes('ci/cd') ||
    lowerQuery.includes('pipeline') ||
    lowerQuery.includes('action') ||
    lowerQuery.includes('automation')
  ) {
    return 'DEPLOY';
  }

  if (
    lowerQuery.includes('analyze') ||
    lowerQuery.includes('repo') ||
    lowerQuery.includes('repository') ||
    lowerQuery.includes('understand') ||
    lowerQuery.includes('structure')
  ) {
    return 'ANALYZE';
  }

  if (
    lowerQuery.includes('metric') ||
    lowerQuery.includes('performance') ||
    lowerQuery.includes('cpu') ||
    lowerQuery.includes('memory') ||
    lowerQuery.includes('traffic') ||
    lowerQuery.includes('scale') ||
    lowerQuery.includes('latency') ||
    lowerQuery.includes('monitoring')
  ) {
    return 'METRICS';
  }

  if (
    lowerQuery.includes('error') ||
    lowerQuery.includes('fail') ||
    lowerQuery.includes('crash') ||
    lowerQuery.includes('fix') ||
    lowerQuery.includes('debug') ||
    lowerQuery.includes('issue')
  ) {
    return 'TROUBLESHOOT';
  }

  if (
    lowerQuery.includes('how') ||
    lowerQuery.includes('what') ||
    lowerQuery.includes('explain') ||
    lowerQuery.includes('guide')
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
    console.log(`🔍 Searching Qdrant for project ${projectId} context...`);
    const repoResults = await searchRepoAnalysis(query, [projectId], 3);
    if (repoResults.length > 0) {
      relevantContext.repoAnalysis = repoResults[0];
      console.log(`✅ Found repo analysis in Qdrant:`, {
        framework: repoResults[0].framework,
        score: repoResults[0].score,
        hasAnalysis: !!repoResults[0].analysis,
      });
    } else {
      console.log(`⚠️ No repo analysis found in Qdrant for project ${projectId}`);
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
  let basePrompt = `You are Evolvx AI, a Senior SRE and DevOps Engineer acting as a core specialized agent within the Evolvx Platform.
Your goal is to autonomously assist developers in achieving production excellence. You do not just answer questions; you provide concrete engineering solutions.

You have deep access to:
- **Repository Context**: Analyzed code structure, dependencies, and frameworks via Qdrant.
- **Deployment History**: Past builds, logs, and failure patterns.
- **Live Metrics**: Real-time telemetry (CPU, RAM, Latency).

**Core Capabilities & Behaviors**:
1. **CI/CD Expert**:
   - If asked about CI/CD, always propose a complete, valid 'github-actions' YAML workflow specific to their framework.
   - Explain the steps (Lint -> Build -> Test -> Deploy).
2. **Infrastructure-as-Code**:
   - Provide Dockerfiles optimized for production (multi-stage builds, alpine images).
   - Suggest Kubernetes manifests or Helm charts if scaling is mentioned.
3. **Proactive SRE**:
   - When looking at metrics, look for anomalies. Suggest auto-scaling rules if CPU > 70%.
   - Suggest implementing alerts for error rate spikes.
4. **Root Cause Analysis**:
   - When debugging, correlate the specific error in logs with the repository code context.
   - Suggest exact code fixes or config changes.

**Tone**: Professional, Technical, authoritative but helpful using "we" (as a partner engineer).
**Output Format**: Use Markdown. Always put code/config in code blocks with language tags (yaml, dockerfile, bash).

If the user asks about the platform, "Evolvx" is the intelligent PaaS you are integrated into.`;

  if (context.project) {
    basePrompt += `\n\n**Current Context**
Project: ${context.project.name}
Framework: ${context.project.framework || 'Unknown'}
Status: ${context.project.status}
Deployment Type: ${context.project.deploymentType}`;
  }

  if (context.repoAnalysis) {
    basePrompt += `\n\n**Repository Intelligence**:\n${context.repoAnalysis.analysis}`;
  }

  if (context.recentDeployments && context.recentDeployments.length > 0) {
    basePrompt += `\n\n**Recent Deployments**:`;
    context.recentDeployments.forEach((d: any) => {
      basePrompt += `\n- ${d.version}: ${d.status}`;
      if (d.error) basePrompt += ` (Error: ${d.error})`;
    });
  }

  if (context.similarErrors && context.similarErrors.length > 0) {
    basePrompt += `\n\n**Known Error Patterns**:`;
    context.similarErrors.forEach((e: any, i: number) => {
      basePrompt += `\n${i + 1}. ${e.errorMessage}\n   Solution: ${e.solution}`;
    });
  }

  // Intent-specific additions
  if (intent === 'DEPLOY') {
    basePrompt += `\n\n**Task**: The user is focusing on Deployment/CI/CD.
- If asking for a pipeline, generate a '.github/workflows/main.yml'.
- If asking for a build config, generate a 'Dockerfile'.
- Focus on best practices (caching, security scanning, gradual rollouts).`;
  } else if (intent === 'TROUBLESHOOT') {
    basePrompt += `\n\n**Task**: Troubleshooting active issues.
- Analyze the error relative to the framework (${context.project?.framework}).
- Suggest specific commands to check logs or rollback.`;
  } else if (intent === 'METRICS') {
    basePrompt += `\n\n**Task**: Performance Analysis.
- Interpret the metrics. Is the app over-provisioned? Under-provisioned?
- Suggest scaling settings (e.g., "Increase replica count to 3").`;
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

  // Trigger repository analysis for ANALYZE intent
  if (intent === 'ANALYZE') {
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
