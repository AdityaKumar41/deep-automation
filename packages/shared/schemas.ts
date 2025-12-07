import { z } from "zod";

// ==================== ORGANIZATION SCHEMAS ====================

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  clerkOrgId: z.string().optional(),
  ownerId: z.string().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "DEVELOPER", "VIEWER"]).default("DEVELOPER"),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "DEVELOPER", "VIEWER"]),
});

// ==================== PROJECT SCHEMAS ====================

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  organizationId: z.string(),
  repoUrl: z.string().url(),
  deploymentType: z
    .enum(["TRIVX_RUNNER", "GITHUB_ACTIONS"])
    .default("TRIVX_RUNNER"),
  framework: z.string().optional(),
  buildCommand: z.string().optional(),
  startCommand: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  buildCommand: z.string().optional(),
  startCommand: z.string().optional(),
  status: z
    .enum(["PENDING", "ANALYZING", "CONFIGURED", "ACTIVE", "PAUSED", "FAILED"])
    .optional(),
});

export const addSecretSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string().min(1),
});

// ==================== DEPLOYMENT SCHEMAS ====================

export const createDeploymentSchema = z.object({
  projectId: z.string(),
  version: z.string().optional(),
  commitSha: z.string().optional(),
  branch: z.string().optional(),
});

export const queryDeploymentsSchema = z.object({
  projectId: z.string().optional(),
  status: z
    .enum(["PENDING", "BUILDING", "DEPLOYING", "SUCCESS", "FAILED", "CANCELED"])
    .optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// ==================== CHAT SCHEMAS ====================

export const sendMessageSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1).max(10000),
  projectId: z.string().optional(),
});

export const createChatSessionSchema = z.object({
  projectId: z.string().optional(),
});

// ==================== METRICS SCHEMAS ====================

export const queryMetricsSchema = z.object({
  type: z
    .enum([
      "CPU_USAGE",
      "MEMORY_USAGE",
      "NETWORK_IN",
      "NETWORK_OUT",
      "REQUEST_COUNT",
      "RESPONSE_TIME",
      "ERROR_COUNT",
      "DISK_USAGE",
    ])
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  interval: z.enum(["1m", "5m", "15m", "1h", "1d"]).default("5m"),
});

// ==================== BILLING SCHEMAS ====================

export const createCheckoutSchema = z.object({
  organizationId: z.string(),
  plan: z.enum(["PRO", "TEAM"]),
});

export const reportUsageSchema = z.object({
  organizationId: z.string(),
  metric: z.enum([
    "DEPLOYMENTS",
    "BUILD_MINUTES",
    "STORAGE_GB",
    "BANDWIDTH_GB",
  ]),
  quantity: z.number().positive(),
});

// ==================== GITHUB SCHEMAS ====================

export const githubCallbackSchema = z.object({
  code: z.string(),
  installationId: z.string(),
  setupAction: z.string(),
});

export const pushWorkflowSchema = z.object({
  projectId: z.string(),
  workflowContent: z.string().min(1),
});

export const setSecretsSchema = z.object({
  projectId: z.string(),
  secrets: z.record(z.string(), z.string()),
});

// ==================== COMMON SCHEMAS ====================

export const idParamSchema = z.object({
  id: z.string(),
});

export const organizationIdQuerySchema = z.object({
  organizationId: z.string(),
});

// Type exports
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddSecretInput = z.infer<typeof addSecretSchema>;
export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;
export type QueryDeploymentsInput = z.infer<typeof queryDeploymentsSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateChatSessionInput = z.infer<typeof createChatSessionSchema>;
export type QueryMetricsInput = z.infer<typeof queryMetricsSchema>;
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type ReportUsageInput = z.infer<typeof reportUsageSchema>;
export type GitHubCallbackInput = z.infer<typeof githubCallbackSchema>;
export type PushWorkflowInput = z.infer<typeof pushWorkflowSchema>;
export type SetSecretsInput = z.infer<typeof setSecretsSchema>;
