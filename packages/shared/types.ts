// Common types used across the application

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface RepoAnalysisResult {
  framework: string;
  buildCommand: string;
  startCommand: string;
  port: number;
  envVars: string[];
  dependencies: Record<string, string>;
  hasDockefile: boolean;
  hasPackageJson: boolean;
  hasRequirementsTxt: boolean;
}

export interface BuildArtifact {
  id: string;
  deploymentId: string;
  url: string;
  size: number;
  checksum: string;
  createdAt: string;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface MetricsGraph {
  type: 'line' | 'bar' | 'area';
  title: string;
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
}

export interface DeploymentLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AIInsight {
  type: 'recommendation' | 'warning' | 'error' | 'info';
  title: string;
  description: string;
  action?: {
    label: string;
    url?: string;
    command?: string;
  };
}

export interface WorkflowStep {
  name: string;
  run: string;
  env?: Record<string, string>;
  workingDirectory?: string;
}

export interface PipelineConfig {
  steps: WorkflowStep[];
  triggers?: {
    push?: string[];
    pullRequest?: string[];
  };
  environment?: Record<string, string>;
}
