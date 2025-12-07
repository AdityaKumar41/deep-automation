import { prisma } from '@evolvx/db';
import { AgentContext, AgentResponse } from '../ai-agent';
import { IntentResult } from './router';
import { analyzeRepository } from '../repo-analyzer';
import { analyzeMetrics, diagnoseError } from '../sre';
import { chatCompletion } from '../openai';

/**
 * Dispatch the intent to the appropriate handler
 */
export async function dispatchAction(
  intent: IntentResult,
  query: string,
  context: AgentContext
): Promise<AgentResponse> {
  
  switch (intent.type) {
    case 'DEPLOY_PROJECT':
      return handleDeploy(intent, context);
      
    case 'ANALYZE_REPO':
      return handleAnalyze(intent, context);
      
    case 'MONITOR_RESOURCES':
      return handleMonitor(intent, context);
      
    case 'FIX_ERROR':
      return handleFix(intent, query, context);
      
    case 'CONFIGURE_WORKFLOW':
      return { 
        content: "I can help you configure the workflow. What specific settings would you like to change? (Env vars, build command, etc.)", 
        action: { type: 'NONE' } 
      };

    case 'GENERAL_QUERY':
    default:
      return handleGeneralQuery(query, context);
  }
}

async function handleDeploy(intent: IntentResult, context: AgentContext): Promise<AgentResponse> {
  if (!context.projectId) {
    return {
      content: "I need to know which project you want to deploy. Please navigate to a project first.",
      action: { type: 'NONE' }
    };
  }

  // Get project details
  const project = await prisma.project.findUnique({
    where: { id: context.projectId },
    include: {
      deployments: {
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!project) {
    return {
      content: "Project not found.",
      action: { type: 'NONE' }
    };
  }

  // Check if there's already an active deployment
  const activeDeployment = project.deployments[0];
  if (activeDeployment && (activeDeployment.status === 'BUILDING' || activeDeployment.status === 'DEPLOYING' || activeDeployment.status === 'PENDING')) {
    return {
      content: `A deployment is already in progress (${activeDeployment.status}). You can watch the progress in the Deployments tab.`,
      action: { type: 'NONE' }
    };
  }

  // Trigger deployment immediately
  return {
    content: `🚀 I've triggered a deployment for **${project.name}**!\n\nYou can watch the real-time build logs in the **Deployments** tab. I'll notify you when it's complete.`,
    action: { 
      type: 'DEPLOY_PROJECT', 
      params: { projectId: context.projectId, ...intent.params } 
    }
  };
}

async function handleAnalyze(intent: IntentResult, context: AgentContext): Promise<AgentResponse> {
    if (!context.projectId) {
       // Try to extract repoUrl from params if available
       if (intent.params.repoUrl) {
           // This would ideally trigger a new project creation flow or just analysis
           return {
               content: `Analyzing repository: ${intent.params.repoUrl}...`,
               action: { type: 'ANALYZE_REPO', params: { repoUrl: intent.params.repoUrl } }
           };
       }
       return {
         content: "Please specify a project or repository URL to analyze.",
         action: { type: 'NONE' }
       };
    }

    // Logic to fetch project and get repo URL
    const project = await prisma.project.findUnique({ where: { id: context.projectId }});
    if (!project) return { content: "Project not found.", action: { type: 'NONE' }};

    return {
        content: `Analyzing repository for ${project.name} (${project.repoUrl})...`,
        action: { type: 'ANALYZE_REPO', params: { projectId: context.projectId, repoUrl: project.repoUrl } }
    };
}



// ... (in handleMonitor)
async function handleMonitor(intent: IntentResult, context: AgentContext): Promise<AgentResponse> {
    if (!context.projectId) {
        return { content: "Which project's metrics would you like to see?", action: { type: 'NONE' } };
    }
    
    // Use new SRE service
    const insight = await analyzeMetrics(context.projectId);
    return {
        content: insight,
        action: { type: 'SHOW_METRICS', params: { projectId: context.projectId } }
    };
}

async function handleFix(intent: IntentResult, query: string, context: AgentContext): Promise<AgentResponse> {
    // Logic: fetch recent error logs
    if (!context.projectId) return { content: "Please select a project to troubleshoot.", action: { type: 'NONE' } };

    const failedDeploy = await prisma.deployment.findFirst({
        where: { projectId: context.projectId, status: 'FAILED' },
        orderBy: { startedAt: 'desc' }
    });

    if (!failedDeploy) {
        return { content: "I don't see any recent failed deployments for this project. Could you describe the error?", action: { type: 'NONE' }};
    }

    // Use new SRE service
    const diagnosis = await diagnoseError(failedDeploy.id);

    return {
        content: `**Diagnosis for recent failure:**\n\n${diagnosis.summary}\n\n**Root Cause:** ${diagnosis.rootCause}\n**Fix:** ${diagnosis.suggestedFix}`,
        action: { type: 'FIX_ERROR', params: { deploymentId: failedDeploy.id } }
    };
}

async function handleGeneralQuery(query: string, context: AgentContext): Promise<AgentResponse> {
    // Fallback to standard chat completion
    const response = await chatCompletion({
        messages: [
            { role: 'system', content: "You are Evolvx AI. Answer the user's question helpfuly." },
            { role: 'user', content: query }
        ]
    });
    
    return {
        content: response.content,
        action: { type: 'NONE' }
    };
}
