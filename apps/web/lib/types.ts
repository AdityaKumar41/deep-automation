export type Language =
  | "javascript"
  | "typescript"
  | "python"
  | "java"
  | "cpp"
  | "c"
  | "csharp"
  | "go"
  | "rust"
  | "ruby"
  | "php"
  | "swift"
  | "kotlin"
  | "scala"
  | "dart"
  | "html"
  | "css"
  | "scss"
  | "json"
  | "yaml"
  | "xml"
  | "sql"
  | "graphql"
  | "bash"
  | "shell"
  | "powershell"
  | "markdown"
  | "jsx"
  | "tsx"
  | "vue"
  | "svelte"
  | "r"
  | "perl"
  | "elixir"
  | "haskell"
  | "lua";

export interface Snippet {
  id: string;
  title: string;
  description: string;
  code: string;
  language: Language;
  tags: string[];
  category: string;
  visibility: "public" | "private";
  createdAt: string;
  updatedAt: string;
  versions: SnippetVersion[];
}

export interface SnippetVersion {
  id: string;
  code: string;
  timestamp: string;
  message?: string;
}

export interface SnippetFilters {
  search?: string;
  language?: Language;
  tags?: string[];
  category?: string;
  visibility?: "public" | "private";
  useRegex?: boolean;
}

// API Types and Interfaces for Evolvx AI
export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  members?: OrganizationMember[];
  subscription?: {
    plan: "FREE" | "PRO" | "TEAM";
    status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING" | "INCOMPLETE";
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  clerkUserId?: string;
  email: string;
  role: "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER" | "MEMBER"; // Matching Prisma + frontend usage
  invitedAt: string;
  joinedAt?: string;
  user?: {
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
  };
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  repositoryUrl: string;
  branch: string;
  framework: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  deploymentType: "TRIVX_RUNNER" | "GITHUB_ACTIONS";
  status: "ANALYZING" | "READY" | "ERROR";
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  commitSha: string;
  commitMessage: string;
  branch: string;
  status:
    | "PENDING"
    | "BUILDING"
    | "DEPLOYING"
    | "SUCCESS"
    | "FAILED"
    | "CANCELLED";
  startedAt: string;
  completedAt: string | null;
  buildLogs: string | null;
  deploymentUrl: string | null;
  errorMessage: string | null;
}

export interface DeploymentMetrics {
  deploymentId: string;
  timestamp: string;
  cpuUsage: number;
  memoryUsage: number;
  networkIn: number;
  networkOut: number;
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
}

export interface Secret {
  id: string;
  projectId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  action?: {
    type: "DEPLOY" | "ANALYZE" | "METRICS" | "LOGS";
    projectId?: string;
    deploymentId?: string;
    data?: any;
  };
  createdAt: string;
}

export interface ChatSession {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface BillingSubscription {
  id: string;
  organizationId: string;
  plan: "FREE" | "PRO" | "TEAM" | "ENTERPRISE";
  status: "ACTIVE" | "CANCELLED" | "PAST_DUE" | "UNPAID";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface BillingUsage {
  organizationId: string;
  period: string;
  deployments: number;
  buildMinutes: number;
  storageGB: number;
  bandwidthGB: number;
  aiRequests: number;
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  url: string;
  defaultBranch: string;
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | "DEPLOYMENT_SUCCESS"
    | "DEPLOYMENT_FAILED"
    | "BUILD_STARTED"
    | "INVITE"
    | "SYSTEM";
  title: string;
  message: string;
  read: boolean;
  metadata?: any;
  createdAt: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Form Types
export interface CreateOrganizationInput {
  name: string;
  slug: string;
}

export interface CreateProjectInput {
  name: string;
  organizationId: string;
  repositoryUrl: string;
  branch?: string;
  deploymentType: "TRIVX_RUNNER" | "GITHUB_ACTIONS";
}

export interface CreateSecretInput {
  key: string;
  value: string;
}

export interface UpdateProjectInput {
  name?: string;
  branch?: string;
  buildCommand?: string;
  startCommand?: string;
}
