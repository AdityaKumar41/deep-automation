import { QdrantClient } from '@qdrant/qdrant-js';
import { QDRANT_COLLECTIONS } from '@evolvx/shared';
import { generateEmbedding } from './openai';

// Initialize Qdrant client
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});

const VECTOR_SIZE = 3072; // text-embedding-3-large dimension

/**
 * Initialize Qdrant collections
 * Call this on server startup
 */
export async function initializeCollections() {
  const collections = Object.values(QDRANT_COLLECTIONS);

  console.log('🔧 Initializing Qdrant collections...');

  for (const collectionName of collections) {
    try {
      // Check if collection exists
      const exists = await qdrant.collectionExists(collectionName);

      if (!exists) {
        console.log(`   Creating collection: ${collectionName}`);
        // Create collection
        await qdrant.createCollection(collectionName, {
          vectors: {
            size: VECTOR_SIZE,
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
        });

        console.log(`   ✅ Created Qdrant collection: ${collectionName}`);
      } else {
        console.log(`   ℹ️  Collection exists: ${collectionName}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Failed to create collection ${collectionName}:`, error.message);
      // Continue with other collections even if one fails
    }
  }
  
  console.log('✅ Qdrant collections initialization complete');
}

/**
 * Store repository analysis in Qdrant
 */
export async function storeRepoAnalysis(data: {
  projectId: string;
  repoUrl: string;
  framework: string;
  dependencies: string[];
  structure: any;
  analysis: string;
}) {
  const { projectId, repoUrl, framework, dependencies, structure, analysis } = data;

  try {
    // Ensure collection exists
    const collectionExists = await qdrant.collectionExists(QDRANT_COLLECTIONS.repoAnalysis);
    if (!collectionExists) {
      console.log('Creating repo_analysis collection...');
      await qdrant.createCollection(QDRANT_COLLECTIONS.repoAnalysis, {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine',
        },
      });
    }

    // Generate embedding from analysis text
    const embedding = await generateEmbedding(analysis);

    // Validate embedding size
    if (embedding.length !== VECTOR_SIZE) {
      throw new Error(`Invalid embedding size: ${embedding.length}, expected ${VECTOR_SIZE}`);
    }

    // Generate a UUID v5 from projectId (Qdrant requires UUID or unsigned int)
    const crypto = await import('crypto');
    // Use a namespace UUID (can be any valid UUID, using DNS namespace as example)
    const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const pointId = crypto.createHash('sha256').update(projectId).digest('hex').slice(0, 32);
    // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuid = `${pointId.slice(0, 8)}-${pointId.slice(8, 12)}-${pointId.slice(12, 16)}-${pointId.slice(16, 20)}-${pointId.slice(20, 32)}`;

    console.log(`   Generated UUID ${uuid} for project ${projectId}`);

    // Store in Qdrant
    await qdrant.upsert(QDRANT_COLLECTIONS.repoAnalysis, {
      wait: true,
      points: [
        {
          id: uuid,
          vector: embedding,
          payload: {
            projectId, // Keep original projectId in payload for searching
            repoUrl,
            framework: framework || 'Unknown',
            dependencies: dependencies.slice(0, 100), // Limit array size
            dependencyCount: dependencies.length,
            structure: JSON.stringify(structure).slice(0, 50000), // Truncate if too large
            analysis: analysis.slice(0, 10000), // Limit analysis text size
            type: 'repo_analysis',
            createdAt: new Date().toISOString(),
          },
        },
      ],
    });

    console.log(`✅ Stored repo analysis in Qdrant for project ${projectId}`);
    return { success: true, projectId };
  } catch (error: any) {
    console.error('Failed to store repo analysis in Qdrant:', {
      error: error.message || error,
      projectId,
      hasEmbedding: !!analysis,
      errorDetails: error.data || error.response?.data,
    });
    // Don't throw - allow repo analysis to complete even if Qdrant fails
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Store deployment logs
 */
export async function storeDeploymentLog(data: {
  deploymentId: string;
  projectId: string;
  status: string;
  logs: string;
  errorMessage?: string;
}) {
  const { deploymentId, projectId, status, logs, errorMessage } = data;

  // Generate embedding from logs
  const text = errorMessage ? `${logs}\nError: ${errorMessage}` : logs;
  const embedding = await generateEmbedding(text);

  await qdrant.upsert(QDRANT_COLLECTIONS.deploymentLogs, {
    points: [
      {
        id: deploymentId,
        vector: embedding,
        payload: {
          deploymentId,
          projectId,
          status,
          logs,
          errorMessage,
          type: 'deployment_log',
          createdAt: new Date().toISOString(),
        },
      },
    ],
  });

  return { success: true, deploymentId };
}

/**
 * Store chat message
 */
export async function storeChatMessage(data: {
  messageId: string;
  sessionId: string;
  projectId?: string;
  role: string;
  content: string;
}) {
  const { messageId, sessionId, projectId, role, content } = data;

  // Only embed user and assistant messages
  if (role !== 'system') {
    const embedding = await generateEmbedding(content);

    await qdrant.upsert(QDRANT_COLLECTIONS.chatHistory, {
      points: [
        {
          id: messageId,
          vector: embedding,
          payload: {
            messageId,
            sessionId,
            projectId,
            role,
            content,
            type: 'chat_message',
            createdAt: new Date().toISOString(),
          },
        },
      ],
    });
  }

  return { success: true, messageId };
}

/**
 * Store code file embedding
 */
export async function storeCodeFile(data: {
  projectId: string;
  filePath: string;
  fileType: string;
  content: string;
}) {
  const { projectId, filePath, fileType, content } = data;

  // Generate embedding from code content (chunk if necessary)
  // For MVP, we truncate or assume it fits
  const embedding = await generateEmbedding(content.slice(0, 8000));

  const id = `${projectId}-${filePath.replace(/\//g, '_')}`;

  await qdrant.upsert(QDRANT_COLLECTIONS.code, {
    points: [
      {
        id: require('crypto').createHash('md5').update(id).digest('hex'), 
        vector: embedding,
        payload: {
          projectId,
          repoPath: filePath,
          fileType,
          content, // Optional: store content if needed for retrieval, can be large.
          type: 'code_file',
          createdAt: new Date().toISOString(),
        },
      },
    ],
  });

  return { success: true, id };
}

/**
 * Store error pattern for future detection
 */
export async function storeErrorPattern(data: {
  id: string;
  projectId: string;
  errorType: string;
  errorMessage: string;
  solution: string;
}) {
  const { id, projectId, errorType, errorMessage, solution } = data;

  const text = `Error: ${errorMessage}\nSolution: ${solution}`;
  const embedding = await generateEmbedding(text);

  await qdrant.upsert(QDRANT_COLLECTIONS.errorPatterns, {
    points: [
      {
        id,
        vector: embedding,
        payload: {
          id,
          projectId,
          errorType,
          errorMessage,
          solution,
          type: 'error_pattern',
          createdAt: new Date().toISOString(),
        },
      },
    ],
  });

  return { success: true, id };
}

/**
 * Semantic search across repository analyses
 */
export async function searchRepoAnalysis(query: string, projectIds?: string[], limit = 5) {
  const embedding = await generateEmbedding(query);

  const filter: any = { must: [{ key: 'type', match: { value: 'repo_analysis' } }] };
  
  if (projectIds && projectIds.length > 0) {
    filter.must.push({
      key: 'projectId',
      match: { any: projectIds },
    });
  }

  const results = await qdrant.search(QDRANT_COLLECTIONS.repoAnalysis, {
    vector: embedding,
    limit,
    filter,
  });

  console.log(`🔍 Qdrant Search: coll=${QDRANT_COLLECTIONS.repoAnalysis} query="${query}" filter=${JSON.stringify(filter)} results=${results.length}`);
  if (results.length > 0) {
      console.log(`   Top result score: ${results[0].score}`);
      console.log(`   Top result payload projectId: ${results[0].payload?.projectId}`);
  } else {
      console.log(`   ⚠️ No results found. Checking if collection exists...`);
      const exists = await qdrant.collectionExists(QDRANT_COLLECTIONS.repoAnalysis);
      console.log(`   Collection ${QDRANT_COLLECTIONS.repoAnalysis} exists: ${exists}`);
  }

  return results.map((r) => ({
    projectId: r.payload?.projectId,
    score: r.score,
    framework: r.payload?.framework,
    analysis: r.payload?.analysis,
    dependencies: r.payload?.dependencies,
  }));
}

/**
 * Search chat history for context
 */
export async function searchChatHistory(query: string, sessionId?: string, limit = 10) {
  const embedding = await generateEmbedding(query);

  const filter: any = { must: [{ key: 'type', match: { value: 'chat_message' } }] };
  
  if (sessionId) {
    filter.must.push({
      key: 'sessionId',
      match: { value: sessionId },
    });
  }

  const results = await qdrant.search(QDRANT_COLLECTIONS.chatHistory, {
    vector: embedding,
    limit,
    filter,
  });

  return results.map((r) => ({
    messageId: r.payload?.messageId,
    score: r.score,
    role: r.payload?.role,
    content: r.payload?.content,
    createdAt: r.payload?.createdAt,
  }));
}

/**
 * Find similar error patterns
 */
export async function findSimilarErrors(errorMessage: string, projectId?: string, limit = 3) {
  const embedding = await generateEmbedding(errorMessage);

  const filter: any = { must: [{ key: 'type', match: { value: 'error_pattern' } }] };
  
  if (projectId) {
    filter.must.push({
      key: 'projectId',
      match: { value: projectId },
    });
  }

  const results = await qdrant.search(QDRANT_COLLECTIONS.errorPatterns, {
    vector: embedding,
    limit,
    filter,
  });

  return results.map((r) => ({
    id: r.payload?.id,
    score: r.score,
    errorType: r.payload?.errorType,
    errorMessage: r.payload?.errorMessage,
    solution: r.payload?.solution,
  }));
}

/**
 * Delete all data for a project
 */
export async function deleteProjectData(projectId: string) {
  const collections = Object.values(QDRANT_COLLECTIONS);

  for (const collection of collections) {
    await qdrant.delete(collection, {
      filter: {
        must: [{ key: 'projectId', match: { value: projectId } }],
      },
    });
  }

  return { success: true, projectId };
}

export { qdrant };
