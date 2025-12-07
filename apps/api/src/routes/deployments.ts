import { FastifyPluginAsync } from "fastify";
import { prisma } from "@evolvx/db";
import { requireAuth } from "../middleware/auth";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate";
import {
  createDeploymentSchema,
  queryDeploymentsSchema,
  idParamSchema,
} from "@evolvx/shared";
import {
  generateGitHubActionsWorkflow,
  generateDockerfile,
  WorkflowConfig,
} from "../services/workflow-generator";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { encryptGitHubSecret } from "@evolvx/shared";
import { reportUsage } from "../services/polar";

const deploymentRoutes: FastifyPluginAsync = async (fastify) => {
  // Create deployment
  fastify.post(
    "/",
    {
      preHandler: [requireAuth, validateBody(createDeploymentSchema)],
    },
    async (request, reply) => {
      const { projectId, version, commitSha, branch } = request.body as any;

      // Get user from database
      const dbUser = await prisma.user.findUnique({
        where: { clerkUserId: request.auth!.userId },
      });

      if (!dbUser) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "User not found in database",
        });
      }

      // Get project details
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          organization: {
            include: {
              members: {
                where: { clerkUserId: request.auth!.userId },
              },
              githubInstallation: true,
            },
          },
          secrets: true,
        },
      });

      if (!project || project.organization.members.length === 0) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Project not found or access denied",
        });
      }

      // Check deployment type
      if (project.deploymentType === "GITHUB_ACTIONS") {
        // Ensure GitHub workflow is set up
        if (!project.organization.githubInstallation) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "GitHub App not installed for this organization",
          });
        }

        // Push workflow if not exists
        await ensureGitHubWorkflow(project, fastify);
      }

      // Create deployment record
      const deployment = await prisma.deployment.create({
        data: {
          projectId,
          version: version || `v${Date.now()}`,
          commitSha: commitSha || null,
          branch: branch || "main",
          status: "PENDING",
          deployedBy: dbUser.id,
        },
      });

      // Trigger deployment based on type
      if (project.deploymentType === "GITHUB_ACTIONS") {
        // Trigger GitHub Actions workflow
        await triggerGitHubWorkflow(project, deployment, fastify);
      } else {
        // Trigger Trivx Runner
        await triggerTrivxRunner(project, deployment, fastify);
      }

      return { deployment };
    }
  );

  // List deployments
  fastify.get(
    "/",
    {
      preHandler: [requireAuth, validateQuery(queryDeploymentsSchema)],
    },
    async (request, reply) => {
      const {
        projectId,
        status,
        limit = 20,
        offset = 0,
      } = request.query as any;

      const where: any = {};

      if (projectId) {
        // Verify access to project
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          include: {
            organization: {
              include: {
                members: {
                  where: { clerkUserId: request.auth!.userId },
                },
              },
            },
          },
        });

        if (!project || project.organization.members.length === 0) {
          return reply.code(403).send({
            error: "Forbidden",
            message: "Access denied to this project",
          });
        }

        where.projectId = projectId;
      }

      if (status) {
        where.status = status;
      }

      const deployments = await prisma.deployment.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              framework: true,
            },
          },
        },
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
      });

      const total = await prisma.deployment.count({ where });

      return {
        deployments,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };
    }
  );

  // Get deployment details
  fastify.get(
    "/:id",
    {
      preHandler: [requireAuth, validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const deployment = await prisma.deployment.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              organization: {
                include: {
                  members: {
                    where: { clerkUserId: request.auth!.userId },
                  },
                },
              },
            },
          },
        },
      });

      if (!deployment || deployment.project.organization.members.length === 0) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Deployment not found or access denied",
        });
      }

      return { deployment };
    }
  );

  // Get deployment logs
  fastify.get(
    "/:id/logs",
    {
      preHandler: [requireAuth, validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const deployment = await prisma.deployment.findUnique({
        where: { id },
        select: {
          id: true,
          buildLogs: true,
          deployLogs: true,
          project: {
            include: {
              organization: {
                include: {
                  members: {
                    where: { clerkUserId: request.auth!.userId },
                  },
                },
              },
            },
          },
        },
      });

      if (!deployment || deployment.project.organization.members.length === 0) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Deployment not found or access denied",
        });
      }

      return {
        buildLogs: deployment.buildLogs || "",
        deployLogs: deployment.deployLogs || "",
      };
    }
  );

  // Stream deployment logs (SSE)
  fastify.get(
    "/:id/logs/stream",
    {
      preHandler: [requireAuth, validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Verify access
      const deployment = await prisma.deployment.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              organization: {
                include: {
                  members: {
                    where: { clerkUserId: request.auth!.userId },
                  },
                },
              },
            },
          },
        },
      });

      if (!deployment || deployment.project.organization.members.length === 0) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Deployment not found or access denied",
        });
      }

      // Set up SSE
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Send existing logs first
      const existingLogs = deployment.buildLogs || deployment.deployLogs || "";
      if (existingLogs) {
        const lines = existingLogs.split('\n').filter(line => line.trim());
        for (const line of lines) {
          const logData = {
            log: line,
            timestamp: new Date().toISOString(),
            level: line.includes('ERROR') ? 'ERROR' : line.includes('WARN') ? 'WARN' : line.includes('SUCCESS') ? 'SUCCESS' : 'INFO',
          };
          reply.raw.write(`data: ${JSON.stringify(logData)}\n\n`);
        }
      }

      // Poll for new logs every 2 seconds
      const interval = setInterval(async () => {
        try {
          const updated = await prisma.deployment.findUnique({
            where: { id },
            select: { status: true, buildLogs: true, deployLogs: true },
          });

          if (!updated) {
            clearInterval(interval);
            reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            reply.raw.end();
            return;
          }

          // Check if deployment is complete
          if (['SUCCESS', 'FAILED', 'CANCELED'].includes(updated.status)) {
            clearInterval(interval);
            reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            reply.raw.end();
          }
        } catch (error) {
          clearInterval(interval);
          reply.raw.end();
        }
      }, 2000);

      // Clean up on client disconnect
      request.raw.on('close', () => {
        clearInterval(interval);
      });
    }
  );

  // Simplified trigger endpoint
  fastify.post(
    "/trigger",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const { projectId, branch } = request.body as any;

      if (!projectId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "projectId is required",
        });
      }

      // Get user from database
      const dbUser = await prisma.user.findUnique({
        where: { clerkUserId: request.auth!.userId },
      });

      if (!dbUser) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "User not found in database",
        });
      }

      // Get project details
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          organization: {
            include: {
              members: {
                where: { clerkUserId: request.auth!.userId },
              },
              githubInstallation: true,
            },
          },
          secrets: true,
        },
      });

      if (!project || project.organization.members.length === 0) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Project not found or access denied",
        });
      }

      // Create deployment record
      const deployment = await prisma.deployment.create({
        data: {
          projectId,
          version: `v${Date.now()}`,
          branch: branch || "main",
          status: "PENDING",
          deployedBy: dbUser.id,
        },
      });

      // Trigger deployment via Inngest
      const { inngest } = await import("../inngest/client");
      await inngest.send({
        name: "deployment.queued",
        data: {
          deploymentId: deployment.id,
          projectId,
        },
      });

      return { 
        deploymentId: deployment.id,
        status: 'queued'
      };
    }
  );

  // Get deployments by project
  fastify.get(
    "/projects/:projectId/deployments",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };

      // Verify access to project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          organization: {
            include: {
              members: {
                where: { clerkUserId: request.auth!.userId },
              },
            },
          },
        },
      });

      if (!project || project.organization.members.length === 0) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Access denied to this project",
        });
      }

      const deployments = await prisma.deployment.findMany({
        where: { projectId },
        orderBy: { startedAt: "desc" },
        take: 20,
      });

      return { deployments };
    }
  );

  // Cancel deployment
  fastify.post(
    "/:id/cancel",
    {
      preHandler: [requireAuth, validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const deployment = await prisma.deployment.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              organization: {
                include: {
                  members: {
                    where: { clerkUserId: request.auth!.userId },
                  },
                },
              },
            },
          },
        },
      });

      if (!deployment || deployment.project.organization.members.length === 0) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Deployment not found or access denied",
        });
      }

      if (!["PENDING", "BUILDING", "DEPLOYING"].includes(deployment.status)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Can only cancel pending or in-progress deployments",
        });
      }

      const updated = await prisma.deployment.update({
        where: { id },
        data: {
          status: "CANCELED",
          completedAt: new Date(),
        },
      });

      return { deployment: updated };
    }
  );
};

/**
 * Ensure GitHub Actions workflow exists in repository
 */
async function ensureGitHubWorkflow(project: any, fastify: any) {
  const installation = project.organization.githubInstallation;
  if (!installation) return;

  // Create Octokit with installation auth
  const auth = createAppAuth({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  });

  const installationAuth = await auth({
    type: "installation",
    installationId: installation.installationId,
  });

  const octokit = new Octokit({
    auth: installationAuth.token,
  });

  // Extract owner and repo from URL
  const match = project.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (!match) return;

  const [, owner, repo] = match;

  // Check if workflow exists
  const workflowPath = ".github/workflows/evolvx-deploy.yml";

  try {
    await octokit.repos.getContent({
      owner,
      repo,
      path: workflowPath,
    });
    // Workflow exists, nothing to do
    return;
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }

  // Workflow doesn't exist, create it
  const config: WorkflowConfig = {
    framework: project.framework || "Node.js",
    packageManager: "npm", // TODO: Detect from repo
    buildCommand: project.buildCommand || "npm run build",
    startCommand: project.startCommand || "npm start",
    port: 3000, // TODO: Detect from repo
    envVars: [], // Will be set as secrets
  };

  const workflowContent = generateGitHubActionsWorkflow(config);

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: workflowPath,
    message: "Add Evolvx deployment workflow",
    content: Buffer.from(workflowContent).toString("base64"),
  });

  // Also create Dockerfile if doesn't exist
  try {
    await octokit.repos.getContent({
      owner,
      repo,
      path: "Dockerfile",
    });
  } catch (error: any) {
    if (error.status === 404) {
      const dockerfile = generateDockerfile(config);
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: "Dockerfile",
        message: "Add Dockerfile for Evolvx deployment",
        content: Buffer.from(dockerfile).toString("base64"),
      });
    }
  }

  // Set secrets
  await setGitHubSecrets(project, octokit, owner, repo);
}

/**
 * Set GitHub repository secrets
 */
async function setGitHubSecrets(
  project: any,
  octokit: Octokit,
  owner: string,
  repo: string
) {
  // Get public key
  const { data: publicKey } = await octokit.actions.getRepoPublicKey({
    owner,
    repo,
  });

  const secrets = project.secrets || [];

  // Set each secret
  for (const secret of secrets) {
    const encryptedValue = await encryptGitHubSecret(
      publicKey.key,
      secret.value
    );

    await octokit.actions.createOrUpdateRepoSecret({
      owner,
      repo,
      secret_name: secret.key,
      encrypted_value: encryptedValue,
      key_id: publicKey.key_id,
    });
  }

  // Set Evolvx secrets
  const evolvxSecrets = {
    EVOLVX_API_KEY: process.env.EVOLVX_API_KEY || "placeholder",
    EVOLVX_PROJECT_ID: project.id,
  };

  for (const [name, value] of Object.entries(evolvxSecrets)) {
    const encryptedValue = await encryptGitHubSecret(publicKey.key, value);

    await octokit.actions.createOrUpdateRepoSecret({
      owner,
      repo,
      secret_name: name,
      encrypted_value: encryptedValue,
      key_id: publicKey.key_id,
    });
  }
}

/**
 * Trigger GitHub Actions workflow
 */
async function triggerGitHubWorkflow(
  project: any,
  deployment: any,
  fastify: any
) {
  const installation = project.organization.githubInstallation;
  if (!installation) return;

  const auth = createAppAuth({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  });

  const installationAuth = await auth({
    type: "installation",
    installationId: installation.installationId,
  });

  const octokit = new Octokit({
    auth: installationAuth.token,
  });

  const match = project.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (!match) return;

  const [, owner, repo] = match;

  try {
    await octokit.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: "evolvx-deploy.yml",
      ref: deployment.branch || "main",
    });

    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: "BUILDING",
        buildLogs: "GitHub Actions workflow triggered...",
      },
    });
  } catch (error: any) {
    fastify.log.error({ err: error }, "Failed to trigger GitHub workflow");

    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: "FAILED",
        errorMessage: `Failed to trigger workflow: ${error.message}`,
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Trigger Trivx Runner deployment
 */
async function triggerTrivxRunner(project: any, deployment: any, fastify: any) {
  const axios = (await import("axios")).default;
  const runnerUrl = process.env.RUNNER_SERVICE_URL || "http://localhost:3002";

  try {
    // Generate Dockerfile
    const { generateDockerfile, generateTrivxRunnerConfig } =
      await import("../services/workflow-generator");

    const config = {
      framework: project.framework || "Node.js",
      packageManager: "npm",
      buildCommand: project.buildCommand || "npm run build",
      startCommand: project.startCommand || "npm start",
      port: 3000,
      envVars: [],
    };

    const dockerfile = generateDockerfile(config);

    // Get project secrets
    const secrets = await prisma.secret.findMany({
      where: { projectId: project.id },
    });

    const { decrypt } = await import("@evolvx/shared");
    const envVars: Record<string, string> = {};

    for (const secret of secrets) {
      try {
        envVars[secret.key] = decrypt(secret.value);
      } catch {
        envVars[secret.key] = secret.value;
      }
    }

    // Call runner service
    await axios.post(`${runnerUrl}/deploy`, {
      deploymentId: deployment.id,
      projectId: project.id,
      repoUrl: project.repoUrl,
      branch: deployment.branch || "main",
      commitSha: deployment.commitSha || "latest",
      dockerfile,
      envVars,
      port: config.port,
    });

    fastify.log.info(
      { deploymentId: deployment.id },
      "Trivx Runner deployment triggered"
    );
  } catch (error: any) {
    fastify.log.error(
      { err: error, deploymentId: deployment.id },
      "Failed to trigger Trivx Runner"
    );

    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: "FAILED",
        errorMessage: `Failed to trigger runner: ${error.message}`,
        completedAt: new Date(),
      },
    });
  }
}

export default deploymentRoutes;
