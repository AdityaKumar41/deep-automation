import { RepoAnalysisResult } from '../repo-analyzer';
import { DeploymentPlan, DeploymentProvider } from './types';

interface PlannerInput {
  projectId: string;
  analysis: RepoAnalysisResult;
  preferredProvider?: DeploymentProvider;
  constraints?: {
    cpu?: string;
    memory?: string;
  };
}

/**
 * Generate a Deployment Plan based on repository analysis
 */
export async function createDeploymentPlan(input: PlannerInput): Promise<DeploymentPlan> {
  const { projectId, analysis, preferredProvider = 'EVOLVX_RUNNER' } = input;
  const { framework, buildCommand, startCommand, port, structure } = analysis;

  // 1. Determine Provider (can add logic here to force GH actions for certain criteria)
  const provider = preferredProvider;

  // 2. Determine Base Image & Resources
  const resources = {
    cpu: input.constraints?.cpu || '0.5',
    memory: input.constraints?.memory || '512Mi',
    minInstances: 1,
    maxInstances: 3
  };

  const baseImage = determineBaseImage(framework || 'Node.js', analysis.packageManager);

  // 3. Construct Build Steps
  const buildSteps = [];
  
  // Install dependencies step
  const installCmd = analysis.packageManager === 'pnpm' 
    ? 'pnpm install --frozen-lockfile' 
    : analysis.packageManager === 'yarn' 
    ? 'yarn install --frozen-lockfile'
    : 'npm ci';

  buildSteps.push({
    name: 'Install Dependencies',
    command: installCmd,
    cacheDirectories: ['node_modules']
  });

  // Build step if applicable
  if (buildCommand) {
    buildSteps.push({
      name: 'Build Application',
      command: buildCommand,
      cacheDirectories: ['.next', 'dist', 'build']
    });
  }

  // 4. Construct Runtime Config
  const runtime = {
    command: startCommand || 'npm start',
    port: port || 3000,
    envVars: analysis.envVars,
    healthCheckPath: '/' // Default, AI can refine this later
  };

  return {
    projectId,
    provider,
    framework: framework || 'Unknown',
    resources,
    build: {
      baseImage,
      steps: buildSteps,
      outputDir: determineOutputDir(framework)
    },
    runtime,
    generatedAt: new Date(),
    confidenceScore: 0.9,
    reasoning: `Selected ${framework} strategy with ${baseImage}. Detected build command: ${buildCommand || 'None'}.`
  };
}

function determineBaseImage(framework: string, pm: string | null): string {
  if (framework.includes('Python')) return 'python:3.11-slim';
  if (framework.includes('Go')) return 'golang:1.21-alpine';
  return 'node:20-alpine';
}

function determineOutputDir(framework: string | null): string {
  if (!framework) return 'dist';
  if (framework.includes('Next.js')) return '.next';
  if (framework.includes('Vite')) return 'dist';
  if (framework.includes('Python')) return '.';
  if (framework.includes('Go')) return '.';
  return 'dist';
}
