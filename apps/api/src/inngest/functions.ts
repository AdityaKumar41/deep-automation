import { inngest } from "./client";
import { prisma } from "@evolvx/db";
import { analyzeAndStore } from "../services/repo-analyzer";
import { createDeploymentPlan } from "../services/planner";
import { generateWorkflowFiles } from "../services/workflow/generator";
import {
  sendDeploymentSuccessEmail,
  sendDeploymentFailureEmail,
  sendMemberInviteEmail,
} from "../services/email";
import { publishEvent, EventType } from "@evolvx/queue";
import { reportUsage } from "../services/polar";

/**
 * Background Repository Analysis
 */
export const analyzeRepository = inngest.createFunction(
  { id: "analyze-repository", name: "Analyze Repository" },
  { event: "repo/analyze.requested" },
  async ({ event, step, logger }: any) => {
    const { projectId, repoUrl } = event.data;

    logger.info(`🔍 Starting repository analysis for project ${projectId}`);

    const result = await step.run("analyze-repo", async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          organization: { include: { githubInstallation: true } },
        },
      });
      if (!project) throw new Error("Project not found");

      logger.info(`Found project: ${project.name}`);

      const installationId =
        project.organization.githubInstallation?.installationId;
      
      logger.info(`Calling analyzeAndStore with installationId: ${installationId || 'none'}`);
      
      const analysis = await analyzeAndStore(projectId, repoUrl, installationId);
      
      logger.info(`Analysis complete:`, {
        framework: analysis.framework,
        dependencies: analysis.dependencies.length,
      });
      
      return analysis;
    });

    await step.run("publish-analyzed-event", async () => {
      logger.info('Publishing repo analyzed event');
      await publishEvent(EventType.REPO_ANALYZED, {
        projectId,
        repoUrl,
        framework: result.framework,
        analysis: result,
      });
    });

    await step.run("update-project", async () => {
      logger.info('Updating project with analysis results');
      await prisma.project.update({
        where: { id: projectId },
        data: {
          framework: result.framework || null,
          buildCommand: result.buildCommand || null,
          startCommand: result.startCommand || null,
          status: "CONFIGURED",
        },
      });
      logger.info(`✅ Project ${projectId} updated to CONFIGURED status`);
    });

    return { success: true, analysis: result };
  }
);

/**
 * End-to-End Deployment Preparation Pipeline
 * Triggered by AI or manual deploy request
 */
export const prepareDeployment = inngest.createFunction(
  { id: "prepare-deployment", name: "Prepare Deployment" },
  { event: "deployment/prepare" },
  async ({ event, step }: any) => {
    const { projectId, repoUrl } = event.data;

    // 1. Analyze (or re-analyze)
    const analysis = await step.run("analyze-repo", async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { organization: { include: { githubInstallation: true } } },
      });
      if (!project) throw new Error("Project not found");

      return await analyzeAndStore(
        projectId,
        repoUrl || project.repoUrl,
        project.organization.githubInstallation?.installationId
      );
    });

    // 2. Plan
    const plan = await step.run("create-plan", async () => {
      return await createDeploymentPlan({ projectId, analysis });
    });

    // 3. Generate Workflow
    const workflowFiles = await step.run("generate-workflow", async () => {
      return generateWorkflowFiles(plan);
    });

    // 4. Store Plan/Config
    await step.run("store-configurations", async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "CONFIGURED" },
      });

      // Create or update pipeline
      await prisma.pipeline.create({
        data: {
          projectId,
          name: "AI Generated Pipeline",
          type: "BUILD_AND_DEPLOY",
          config: plan as any,
          workflowPath:
            plan.provider === "GITHUB_ACTIONS"
              ? ".github/workflows/evolvx.yml"
              : undefined,
        },
      });
    });

    // 5. Trigger Execution (or waiting for approval)
    // Sending event for the next stage
    await step.run("trigger-deployment", async () => {
      // Here we could directly create a Deployment record
      // let deployment = await prisma.deployment.create(...)
      // But let's emit event
      await publishEvent(EventType.DEPLOYMENT_QUEUED, {
        projectId,
        plan,
        workflowFiles,
      });
    });

    return { success: true, plan };
  }
);

/**
 * Execute deployment - calls runner service with repo analysis
 */
export const executeDeployment = inngest.createFunction(
  { id: "execute-deployment", name: "Execute Deployment" },
  { event: "deployment.queued" },
  async ({ event, step }: any) => {
    const { deploymentId, projectId } = event.data;

    // 1. Get deployment and project details
    const { deployment, project } = await step.run("fetch-deployment-details", async () => {
      const dep = await prisma.deployment.findUnique({
        where: { id: deploymentId },
      });

      const proj = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          organization: { 
            include: { 
              githubInstallation: true,
              subscription: true,
            } 
          },
          repoAnalyses: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          secrets: true,
        },
      });

      if (!dep || !proj) {
        throw new Error("Deployment or project not found");
      }

      return { deployment: dep, project: proj };
    });

    // 2. Get or create repo analysis
    const analysis = await step.run("get-repo-analysis", async () => {
      let repoAnalysis = project.repoAnalyses[0];

      // If no analysis exists, create one
      if (!repoAnalysis) {
        console.log('📊 No repo analysis found, analyzing repository...');
        const { analyzeAndStore } = await import("../services/repo-analyzer");
        const installationId = project.organization.githubInstallation?.installationId;
        
        repoAnalysis = await analyzeAndStore(
          projectId,
          project.repoUrl,
          installationId
        );
      }

      return repoAnalysis;
    });

    // 3. Generate Dockerfile based on analysis
    const dockerfile = await step.run("generate-dockerfile", async () => {
      const { generateDockerfile } = await import("../services/workflow-generator");
      
      return generateDockerfile({
        framework: analysis.framework || 'Node.js',
        packageManager: analysis.packageManager || 'npm',
        buildCommand: project.buildCommand || 'npm run build',
        startCommand: project.startCommand || 'npm start',
        port: (analysis.deployment as any)?.port || 3000,
        envVars: [],
      });
    });

    // 4. Call runner service
    const result = await step.run("execute-runner", async () => {
      const runnerUrl = process.env.RUNNER_SERVICE_URL || 'http://localhost:3002';
      
      // Get project secrets
      const { decrypt } = await import("@evolvx/shared");
      const envVars: Record<string, string> = {};
      
      for (const secret of project.secrets) {
        try {
          envVars[secret.key] = decrypt(secret.value);
        } catch {
          envVars[secret.key] = secret.value;
        }
      }

      try {
        const response = await fetch(`${runnerUrl}/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deploymentId,
            projectId,
            repoUrl: project.repoUrl,
            branch: deployment.branch || 'main',
            commitSha: deployment.commitSha || 'latest',
            dockerfile,
            envVars,
            port: (analysis.deployment as any)?.port || 3000,
          }),
        });

        if (!response.ok) {
          throw new Error(`Runner service failed: ${response.statusText}`);
        }

        return await response.json();
      } catch (error: any) {
        console.error('❌ Runner service error:', error);
        
        // Update deployment as failed
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: 'FAILED',
            errorMessage: error.message,
            completedAt: new Date(),
          },
        });

        throw error;
      }
    });

    // 5. Track usage
    await step.run("track-usage", async () => {
      try {
        const durationMs = new Date().getTime() - new Date(deployment.createdAt).getTime();
        const durationMinutes = Math.ceil(durationMs / 1000 / 60);

        if (durationMinutes > 0 && project.organization.subscription) {
          await prisma.usage.create({
            data: {
              subscriptionId: project.organization.subscription.id,
              metric: "BUILD_MINUTES",
              quantity: durationMinutes,
              billingPeriod: new Date().toISOString().slice(0, 7)
            }
          });
          
          if (project.organization.subscription.polarCustomerId) {
            await reportUsage(
              project.organization.subscription.polarCustomerId, 
              "BUILD_MINUTES", 
              durationMinutes
            );
          }
        }
      } catch (err) {
        console.error("Failed to track build minutes", err);
      }
    });

    // 6. Emit completed event
    await step.run("emit-completed", async () => {
      const finalDeployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
      });

      await publishEvent(EventType.DEPLOYMENT_COMPLETED, {
        deploymentId,
        projectId,
        status: finalDeployment?.status || 'FAILED',
        error: finalDeployment?.errorMessage,
      });
    });

    return { success: true, deploymentId, result };
  }
);

/**
 * Send Deployment Notification Email
 * Triggered on deployment completion
 */
export const sendDeploymentNotification = inngest.createFunction(
  { id: "send-deployment-notification", name: "Send Deployment Notification" },
  { event: "deployment.completed" },
  async ({ event, step }: any) => {
    const { deploymentId, status } = event.data;

    const deployment = await step.run("fetch-deployment", async () => {
      return await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: {
          project: {
            include: {
              organization: {
                include: {
                  members: {
                    where: { role: "OWNER" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });
    });

    if (!deployment) return { success: false, error: "Deployment not found" };

    const ownerEmail = deployment.project.organization.members[0]?.email;
    if (!ownerEmail) return { success: false, error: "No owner email found" };

    await step.run("send-email", async () => {
      if (status === "SUCCESS") {
        await sendDeploymentSuccessEmail(
          ownerEmail,
          deployment.project.name,
          deployment.deployUrl || "https://evolvx.app",
          deployment.version
        );
      } else if (status === "FAILED") {
        await sendDeploymentFailureEmail(
          ownerEmail,
          deployment.project.name,
          deployment.version,
          deployment.errorMessage || "Unknown error",
          `${process.env.NEXT_PUBLIC_APP_URL}/projects/${deployment.projectId}/deployments/${deploymentId}`
        );
      }
    });

    return { success: true };
  }
);

/**
 * Send Member Invitation Email
 * Triggered when member is invited
 */
export const sendMemberInvitation = inngest.createFunction(
  { id: "send-member-invitation", name: "Send Member Invitation" },
  { event: "member/invited" },
  async ({ event, step }: any) => {
    const { organizationId, email, invitedBy } = event.data;

    const org = await step.run("fetch-organization", async () => {
      return await prisma.organization.findUnique({
        where: { id: organizationId },
      });
    });

    if (!org) return { success: false, error: "Organization not found" };

    const inviter = await step.run("fetch-inviter", async () => {
      return await prisma.member.findFirst({
        where: { userId: invitedBy, organizationId },
      });
    });

    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${organizationId}?email=${encodeURIComponent(email)}`;

    await step.run("send-invite-email", async () => {
      await sendMemberInviteEmail(
        email,
        org.name,
        inviter?.email || "A team member",
        inviteLink
      );
    });

    return { success: true };
  }
);

/**
 * Collect Metrics (Scheduled)
 * Runs every 5 minutes
 */
export const collectMetrics = inngest.createFunction(
  { id: "collect-metrics", name: "Collect Metrics" },
  { cron: "*/5 * * * *" }, // Every 5 minutes
  async ({ step }: any) => {
    const activeDeployments = await step.run(
      "fetch-active-deployments",
      async () => {
        return await prisma.deployment.findMany({
          where: { status: "SUCCESS" },
          include: { project: true },
        });
      }
    );

    for (const deployment of activeDeployments) {
      await step.run(`collect-metrics-${deployment.id}`, async () => {
        // This would call the runner service to get live metrics
        // For now, we'll just publish an event
        await publishEvent(EventType.METRICS_COLLECTED, {
          deploymentId: deployment.id,
          projectId: deployment.projectId,
          timestamp: new Date(),
        });
      });
    }

    return { success: true, deploymentsProcessed: activeDeployments.length };
  }
);

/**
 * Cleanup Old Deployments (Scheduled)
 * Runs daily at midnight
 */
export const cleanupOldDeployments = inngest.createFunction(
  { id: "cleanup-old-deployments", name: "Cleanup Old Deployments" },
  { cron: "0 0 * * *" }, // Daily at midnight
  async ({ step }: any) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deleted = await step.run("delete-old-deployments", async () => {
      // Delete old failed/canceled deployments
      // Note: Consider adding a completedAt timestamp to Deployment model for better cleanup
      return await prisma.deployment.deleteMany({
        where: {
          status: { in: ["FAILED", "CANCELED"] },
        },
        // Would filter by date if completedAt field exists
      });
    });

    return { success: true, deletedCount: deleted.count };
  }
);

// Export all functions
export const functions = [
  analyzeRepository,
  prepareDeployment,
  executeDeployment,
  sendDeploymentNotification,
  sendMemberInvitation,
  collectMetrics,
  cleanupOldDeployments,
];
