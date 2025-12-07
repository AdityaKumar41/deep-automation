import { z } from 'zod';
import { chatCompletion } from '../openai';
import { AgentContext } from '../ai-agent';

export type IntentType = 
  | 'DEPLOY_PROJECT' 
  | 'CONFIGURE_WORKFLOW' 
  | 'MONITOR_RESOURCES' 
  | 'FIX_ERROR' 
  | 'GENERAL_QUERY'
  | 'ANALYZE_REPO';

export interface IntentResult {
  type: IntentType;
  confidence: number;
  params: Record<string, any>;
}

const intentSchema = z.object({
  type: z.enum([
    'DEPLOY_PROJECT',
    'CONFIGURE_WORKFLOW',
    'MONITOR_RESOURCES',
    'FIX_ERROR',
    'GENERAL_QUERY',
    'ANALYZE_REPO'
  ]),
  confidence: z.number(),
  params: z.record(z.any()).describe("Extracted parameters like projectId, repoUrl, errorId, etc.")
});

/**
 * Route user query to a specific intent using LLM
 */
export async function routeIntent(
  query: string,
  context: AgentContext
): Promise<IntentResult> {
  const systemPrompt = `You are the Intent Router for Evolvx AI.
Your job is to classify the user's message into one of the following intents:

- DEPLOY_PROJECT: User wants to deploy, build, or release code.
- CONFIGURE_WORKFLOW: User wants to change CI/CD settings, environment variables, or build steps.
- MONITOR_RESOURCES: User asks about metrics, CPU, memory, traffic, or status.
- FIX_ERROR: User asks for help with a crash, error log, or failed build.
- ANALYZE_REPO: User wants to understand the codebase structure or dependencies.
- GENERAL_QUERY: General questions, greetings, or coding help not related to the above.

Current Context:
Project ID: ${context.projectId || 'None'}
User ID: ${context.userId}

Output JSON only.`;

  try {
    const response = await chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      temperature: 0,
       // We'll force JSON mode by prompt implementation wrapper if needed, 
       // but for now relying on strict system instructions + z parsing or manual parsing.
       // Our chatCompletion wrapper returns content string. 
    });

    // Clean markdown code blocks if present
    const cleanContent = response.content.replace(/```json\n?|\n?```/g, '').trim();
    
    // Parse JSON
    const parsed = JSON.parse(cleanContent);
    
    // Validate with Zod
    // Note: LLM might not match exact schema perfectly without function calling, 
    // but we try. If fails, fallback to heuristic or GENERAL.
    
    const validated = intentSchema.safeParse(parsed);
    
    if (validated.success) {
      return validated.data as IntentResult;
    } else {
      console.warn("Intent validation failed:", validated.error);
      return fallbackIntent(query);
    }
  } catch (err) {
    console.error("Intent routing failed:", err);
    return fallbackIntent(query);
  }
}

function fallbackIntent(query: string): IntentResult {
  const lower = query.toLowerCase();
  
  if (lower.includes('deploy')) return { type: 'DEPLOY_PROJECT', confidence: 0.5, params: {} };
  if (lower.includes('metric') || lower.includes('cpu')) return { type: 'MONITOR_RESOURCES', confidence: 0.5, params: {} };
  if (lower.includes('fix') || lower.includes('error')) return { type: 'FIX_ERROR', confidence: 0.5, params: {} };
  
  return { type: 'GENERAL_QUERY', confidence: 0.1, params: {} };
}
