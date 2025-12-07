import { prisma } from '@evolvx/db';
import * as githubService from './github.service';
import * as metadataExtractor from './metadata-extractor.service';
import { chatCompletion } from './openai';
import { storeRepoAnalysis } from './qdrant';

/**
 * Enhanced Repository Analyzer
 * Comprehensive repository analysis with database persistence and Qdrant integration
 */

export interface RepoAnalysisResult {
  framework: string | null;
  language: string | null;
  packageManager: string | null;
  buildTool: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  port: number | null;
  dependencies: any;
  devDependencies: any;
  envVars: string[];
  structure: any;
  infrastructure: any;
  deployment: any;
  testing: any;
  analysis: string;
}

/**
 * Main analysis function with database persistence
 */
export async function analyzeAndStore(
  projectId: string,
  repoUrl: string,
  installationId?: number
): Promise<RepoAnalysisResult> {
  console.log(`🔍 Starting comprehensive analysis for project ${projectId}`);
  console.log(`   Repository: ${repoUrl}`);
  console.log(`   Installation ID: ${installationId || 'none'}`);

  // Extract owner and repo from URL
  const { owner, repo } = githubService.parseGitHubUrl(repoUrl);

  // Get project to find organizationId
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  // Create pending analysis record
  const analysisRecord = await prisma.repoAnalysis.create({
    data: {
      projectId,
      repositoryFullName: `${owner}/${repo}`,
      repositoryName: repo,
      owner,
      status: 'analyzing',
    },
  });

  try {
    // Get repository metadata
    const repoMetadata = await githubService.getRepositoryMetadata(installationId, owner, repo);
    console.log(`✅ Fetched repository metadata: ${repoMetadata.name}`);

    // Extract comprehensive metadata
    const metadata = await metadataExtractor.extractMetadata(
      installationId,
      owner,
      repo,
      repoMetadata.defaultBranch,
      projectId,
      project.organizationId
    );
    console.log(`✅ Extracted metadata:`, {
      framework: metadata.dependencies.framework,
      language: metadata.dependencies.language,
      buildTool: metadata.build.tool,
      hasDocker: metadata.infrastructure.docker.hasDockerfile,
      hasCICD: !!metadata.infrastructure.cicd.provider,
    });

    // Generate AI summary
    const aiSummary = await generateAISummary(metadata, repoMetadata);
    console.log(`✅ Generated AI summary (${aiSummary.length} chars)`);

    // Update database with results
    await prisma.repoAnalysis.update({
      where: { id: analysisRecord.id },
      data: {
        framework: metadata.dependencies.framework,
        language: metadata.dependencies.language,
        buildTool: metadata.build.tool,
        packageManager: metadata.build.tool,
        hasDockerfile: metadata.infrastructure.docker.hasDockerfile,
        hasCIConfig: !!metadata.infrastructure.cicd.provider,
        dependencies: {
          production: metadata.dependencies.runtime,
          development: metadata.dependencies.development,
        },
        structure: JSON.parse(JSON.stringify(metadata.structure)),
        infrastructure: JSON.parse(JSON.stringify(metadata.infrastructure)),
        environment: JSON.parse(JSON.stringify(metadata.environment)),
        deployment: JSON.parse(JSON.stringify(metadata.deployment)),
        aiSummary,
        status: 'completed',
        completedAt: new Date(),
      },
    });
    console.log(`✅ Stored analysis in database`);

    // Store in Qdrant for RAG
    console.log(`💾 Storing analysis in Qdrant...`);
    const qdrantResult = await storeRepoAnalysis({
      projectId,
      repoUrl,
      framework: metadata.dependencies.framework || 'Unknown',
      dependencies: Object.keys(metadata.dependencies.runtime),
      structure: metadata.structure,
      analysis: aiSummary,
    });

    if (qdrantResult.success) {
      console.log(`✅ Successfully stored in Qdrant`);
    } else {
      console.error(`❌ Failed to store in Qdrant:`, qdrantResult.error);
    }

    // Return result in expected format
    return {
      framework: metadata.dependencies.framework,
      language: metadata.dependencies.language,
      packageManager: metadata.build.tool,
      buildTool: metadata.build.tool,
      buildCommand: metadata.build.commands.build,
      startCommand: metadata.build.commands.start,
      port: metadata.deployment.port || null,
      dependencies: metadata.dependencies.runtime,
      devDependencies: metadata.dependencies.development,
      envVars: metadata.environment.requiredVars,
      structure: metadata.structure,
      infrastructure: metadata.infrastructure,
      deployment: metadata.deployment,
      testing: metadata.testing,
      analysis: aiSummary,
    };
  } catch (error: any) {
    console.error('❌ Repository analysis failed:', error.message);

    // Update status to failed
    await prisma.repoAnalysis.update({
      where: { id: analysisRecord.id },
      data: {
        status: 'failed',
        error: error.message,
      },
    });

    throw error;
  }
}

/**
 * Generate AI summary from metadata
 */
async function generateAISummary(
  metadata: metadataExtractor.RepoMetadata,
  repoMetadata: githubService.RepositoryMetadata
): Promise<string> {
  try {
    // Fetch README for context
    const readme = await githubService.getReadme(
      undefined,
      metadata.repositoryFullName.split('/')[0],
      metadata.repositoryFullName.split('/')[1]
    );

    const readmeContent = readme ? readme.substring(0, 2000) : 'No README found';

    // Build comprehensive analysis prompt
    const analysisPrompt = `You are analyzing a GitHub repository. Provide a detailed technical analysis for DevOps automation.

## Repository Information
- **Name**: ${repoMetadata.name}
- **Description**: ${repoMetadata.description || 'No description'}
- **Language**: ${metadata.dependencies.language}
- **Framework**: ${metadata.dependencies.framework}
- **Stars**: ${repoMetadata.stars}
- **Project Type**: ${metadata.structure.type}

## Technical Stack
- **Build Tool**: ${metadata.build.tool}
- **Build Command**: ${metadata.build.commands.build}
- **Start Command**: ${metadata.build.commands.start}
- **Test Framework**: ${metadata.testing.framework || 'Not detected'}

## Infrastructure
- **Docker**: ${metadata.infrastructure.docker.hasDockerfile ? 'Yes' : 'No'}${metadata.infrastructure.docker.baseImage ? ` (${metadata.infrastructure.docker.baseImage})` : ''}
- **CI/CD**: ${metadata.infrastructure.cicd.provider || 'None'}
- **Kubernetes**: ${metadata.infrastructure.kubernetes.hasManifests ? 'Yes' : 'No'}

## Dependencies
**Production** (${Object.keys(metadata.dependencies.runtime).length} total):
${Object.keys(metadata.dependencies.runtime).slice(0, 20).join(', ')}${Object.keys(metadata.dependencies.runtime).length > 20 ? '...' : ''}

**Development** (${Object.keys(metadata.dependencies.development).length} total):
${Object.keys(metadata.dependencies.development).slice(0, 10).join(', ')}${Object.keys(metadata.dependencies.development).length > 10 ? '...' : ''}

## Environment Variables
${metadata.environment.requiredVars.length > 0 ? metadata.environment.requiredVars.slice(0, 10).join(', ') : 'None detected'}

## Deployment
- **Port**: ${metadata.deployment.port || 'Not detected'}
- **Health Check**: ${metadata.deployment.healthCheck || 'Not detected'}
- **Entry Point**: ${metadata.deployment.entrypoint || 'Not detected'}

## README Content
${readmeContent}

## Analysis Task
Based on the above information, provide a comprehensive DevOps-focused analysis covering:

1. **Application Purpose**: What this application does based on dependencies and README
2. **Architecture & Patterns**: Key architectural patterns and technologies used
3. **Deployment Readiness**: 
   - Is it ready for production deployment?
   - What's missing (Docker, CI/CD, health checks, etc.)?
   - Recommended next steps for deployment
4. **CI/CD Recommendations**: 
   - If no CI/CD exists, suggest appropriate pipeline
   - If CI/CD exists, note what it covers
5. **Infrastructure Recommendations**:
   - Containerization strategy
   - Scaling considerations
   - Monitoring and observability needs
6. **Security & Configuration**:
   - Environment variables and secrets management
   - Security best practices to implement
7. **Notable Features**: Unique aspects based on dependencies

Be specific and reference actual dependencies, files, and configurations you observe. Provide actionable recommendations for a DevOps engineer.`;

    const aiAnalysis = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are an expert SRE and DevOps engineer analyzing repositories for production deployment. Provide concise, actionable technical analysis based on ACTUAL data. Reference specific dependencies, files, and patterns you observe. Focus on deployment readiness and infrastructure recommendations.',
        },
        { role: 'user', content: analysisPrompt },
      ],
      temperature: 0.3,
      maxTokens: 1200,
    });

    return aiAnalysis.content;
  } catch (error) {
    console.error('AI analysis failed (non-critical):', error);

    // Fallback to structured summary
    return `${metadata.dependencies.framework || 'Unknown'} application written in ${metadata.dependencies.language}.

**Build System**: ${metadata.build.tool}
**Dependencies**: ${Object.keys(metadata.dependencies.runtime).length} production, ${Object.keys(metadata.dependencies.development).length} development

**Infrastructure**:
- Docker: ${metadata.infrastructure.docker.hasDockerfile ? '✅ Yes' : '❌ No'}
- CI/CD: ${metadata.infrastructure.cicd.provider || '❌ None'}
- Kubernetes: ${metadata.infrastructure.kubernetes.hasManifests ? '✅ Yes' : '❌ No'}

**Deployment Readiness**: ${metadata.summary.deploymentReady ? '✅ Ready' : '⚠️ Needs setup'}

**Recommended Actions**:
${!metadata.infrastructure.docker.hasDockerfile ? '- Add Dockerfile for containerization\n' : ''}${!metadata.infrastructure.cicd.provider ? '- Set up CI/CD pipeline\n' : ''}${!metadata.deployment.healthCheck ? '- Add health check endpoint\n' : ''}`;
  }
}

/**
 * Get latest analysis from database
 */
export async function getLatestAnalysis(projectId: string): Promise<any | null> {
  const analysis = await prisma.repoAnalysis.findFirst({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });

  return analysis;
}

/**
 * Check if analysis is stale (> 24 hours old)
 */
export function isAnalysisStale(analysis: any): boolean {
  if (!analysis || !analysis.createdAt) return true;
  const ageMs = Date.now() - new Date(analysis.createdAt).getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return ageMs > twentyFourHours;
}

/**
 * Legacy function for backward compatibility
 */
export async function analyzeRepository(
  repoUrl: string,
  installationId?: number
): Promise<RepoAnalysisResult> {
  // This is a simplified version for direct calls without projectId
  // In practice, this should be called via analyzeAndStore with a projectId
  const { owner, repo } = githubService.parseGitHubUrl(repoUrl);
  
  const repoMetadata = await githubService.getRepositoryMetadata(installationId, owner, repo);
  
  const metadata = await metadataExtractor.extractMetadata(
    installationId,
    owner,
    repo,
    repoMetadata.defaultBranch,
    'temp-project-id',
    'temp-org-id'
  );

  const aiSummary = await generateAISummary(metadata, repoMetadata);

  return {
    framework: metadata.dependencies.framework,
    language: metadata.dependencies.language,
    packageManager: metadata.build.tool,
    buildTool: metadata.build.tool,
    buildCommand: metadata.build.commands.build,
    startCommand: metadata.build.commands.start,
    port: metadata.deployment.port || null,
    dependencies: metadata.dependencies.runtime,
    devDependencies: metadata.dependencies.development,
    envVars: metadata.environment.requiredVars,
    structure: metadata.structure,
    infrastructure: metadata.infrastructure,
    deployment: metadata.deployment,
    testing: metadata.testing,
    analysis: aiSummary,
  };
}
