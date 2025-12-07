export type DeploymentProvider = 'EVOLVX_RUNNER' | 'GITHUB_ACTIONS';

export interface BuildStep {
  name: string;
  command: string;
  cacheDirectories?: string[];
  env?: Record<string, string>;
}

export interface DeploymentPlan {
  projectId: string;
  provider: DeploymentProvider;
  framework: string;
  
  // Infrastructure Specs
  resources: {
    cpu: string;
    memory: string;
    minInstances: number;
    maxInstances: number;
  };

  // Build Configuration
  build: {
    baseImage: string;
    steps: BuildStep[];
    outputDir: string;
  };

  // Runtime Configuration
  runtime: {
    command: string;
    port: number;
    envVars: string[];
    healthCheckPath: string;
  };

  // Metadata
  generatedAt: Date;
  confidenceScore: number;
  reasoning: string;
}
