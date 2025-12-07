import { openai } from '@ai-sdk/openai';
import { generateText, streamText, embed } from 'ai';
import { AI_MODELS } from '@evolvx/shared';

/**
 * OpenAI Service
 * Provides wrappers for chat completions, streaming, and embeddings
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/**
 * Generate a chat completion (non-streaming)
 */
export async function chatCompletion(options: ChatCompletionOptions): Promise<{
  content: string;
  finishReason: string;
  usage: any;
}> {
  const {
    messages,
    temperature = 0.7,
    model = AI_MODELS.chat,
  } = options;

  try {
    const result = await generateText({
      model: openai(model),
      messages,
      temperature,
    });

    return {
      content: result.text,
      finishReason: result.finishReason,
      usage: result.usage,
    };
  } catch (error) {
    console.error('OpenAI chat completion error:', error);
    throw new Error('Failed to generate chat completion');
  }
}

/**
 * Generate a streaming chat completion
 */
export async function chatCompletionStream(options: ChatCompletionOptions) {
  const {
    messages,
    temperature = 0.7,
    model = AI_MODELS.chat,
  } = options;

  try {
    const result = await streamText({
      model: openai(model),
      messages,
      temperature,
    });

    return result.textStream;
  } catch (error) {
    console.error('OpenAI streaming error:', error);
    throw new Error('Failed to create chat stream');
  }
}

/**
 * Generate embeddings for text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { embedding } = await embed({
      model: openai.embedding(AI_MODELS.embedding),
      value: text,
    });

    return embedding;
  } catch (error) {
    console.error('OpenAI embedding error:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Generate embeddings for multiple texts
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const embeddings = await Promise.all(
      texts.map((text) => generateEmbedding(text))
    );
    return embeddings;
  } catch (error) {
    console.error('OpenAI batch embedding error:', error);
    throw new Error('Failed to generate embeddings');
  }
}

/**
 * Analyze code and generate insights
 */
export async function analyzeCode(code: string, language: string): Promise<{
  content: string;
  finishReason: string;
  usage: any;
}> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are an expert code analyzer. Analyze ${language} code and provide insights about:
- Main purpose and functionality
- Key dependencies
- Potential issues or improvements
- Architecture patterns used`,
    },
    {
      role: 'user',
      content: `Analyze this ${language} code:\n\n${code}`,
    },
  ];

  return chatCompletion({ messages, temperature: 0.3 });
}

/**
 * Generate deployment instructions
 */
export async function generateDeploymentInstructions(
  framework: string,
  repoStructure: any
): Promise<{
  content: string;
  finishReason: string;
  usage: any;
}> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a DevOps expert. Generate clear, step-by-step deployment instructions for a ${framework} application.`,
    },
    {
      role: 'user',
      content: `Generate deployment instructions for a ${framework} app with this structure:\n${JSON.stringify(repoStructure, null, 2)}`,
    },
  ];

  return chatCompletion({ messages, temperature: 0.5, maxTokens: 1500 });
}

/**
 * Extract environment variables from code
 */
export async function extractEnvVars(code: string) {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a code analyzer. Extract all environment variables referenced in the code.
Return only a JSON array of objects with: { name: string, description: string, required: boolean }`,
    },
    {
      role: 'user',
      content: `Extract environment variables from:\n\n${code}`,
    },
  ];

  const result = await chatCompletion({ messages, temperature: 0.1 });
  
  try {
    return JSON.parse(result.content);
  } catch {
    return [];
  }
}
