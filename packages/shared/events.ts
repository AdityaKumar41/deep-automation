// Event types for Kafka-like messaging

export type EventType =
  // Repository events
  | 'repo.analyzed'
  | 'repo.analysis.failed'
  
  // AI Pipeline events
  | 'ai.pipeline.required'
  | 'ai.pipeline.generated'
  | 'ai.pipeline.failed'
  
  // Workflow events
  | 'workflow.generated'
  | 'workflow.pushed'
  | 'workflow.failed'
  
  // Runner events
  | 'runner.build.start'
  | 'runner.build.progress'
  | 'runner.build.completed'
  | 'runner.build.failed'
  
  // Deployment events
  | 'deployment.start'
  | 'deployment.progress'
  | 'deployment.success'
  | 'deployment.failed'
  
  // Monitoring events
  | 'metrics.collect'
  | 'metrics.alert'
  | 'ai.monitoring.insight'
  
  // GitHub events
  | 'github.installation.created'
  | 'github.installation.deleted'
  | 'github.push'
  | 'github.workflow.run'
  
  // Billing events
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'usage.recorded';

export interface BaseEvent<T = unknown> {
  id: string;
  type: EventType;
  timestamp: string;
  data: T;
  metadata?: Record<string, unknown>;
}

// Repository Events
export interface RepoAnalyzedEvent extends BaseEvent<{
  projectId: string;
  repoUrl: string;
  framework: string;
  buildCommand?: string;
  startCommand?: string;
  envVars: string[];
  port?: number;
}> {
  type: 'repo.analyzed';
}

// Pipeline Events
export interface PipelineGeneratedEvent extends BaseEvent<{
  projectId: string;
  pipelineId: string;
  type: 'github_actions' | 'trivx_runner';
  config: Record<string, unknown>;
}> {
  type: 'ai.pipeline.generated';
}

// Build Events
export interface BuildStartEvent extends BaseEvent<{
  deploymentId: string;
  projectId: string;
  commitSha?: string;
  branch?: string;
}> {
  type: 'runner.build.start';
}

export interface BuildCompletedEvent extends BaseEvent<{
  deploymentId: string;
  projectId: string;
  artifactUrl: string;
  duration: number;
}> {
  type: 'runner.build.completed';
}

// Deployment Events
export interface DeploymentSuccessEvent extends BaseEvent<{
  deploymentId: string;
  projectId: string;
  url: string;
  version: string;
}> {
  type: 'deployment.success';
}

// GitHub Events
export interface GitHubInstallationEvent extends BaseEvent<{
  installationId: number;
  accountId: number;
  accountLogin: string;
  repositories: Array<{ id: number; name: string; fullName: string }>;
}> {
  type: 'github.installation.created';
}

// Billing Events
export interface SubscriptionCreatedEvent extends BaseEvent<{
  organizationId: string;
  plan: 'FREE' | 'PRO' | 'TEAM';
  polarSubscriptionId?: string;
}> {
  type: 'subscription.created';
}

export interface UsageRecordedEvent extends BaseEvent<{
  organizationId: string;
  metric: 'DEPLOYMENTS' | 'BUILD_MINUTES' | 'STORAGE_GB' | 'BANDWIDTH_GB';
  quantity: number;
}> {
  type: 'usage.recorded';
}

export type Event =
  | RepoAnalyzedEvent
  | PipelineGeneratedEvent
  | BuildStartEvent
  | BuildCompletedEvent
  | DeploymentSuccessEvent
  | GitHubInstallationEvent
  | SubscriptionCreatedEvent
  | UsageRecordedEvent;
