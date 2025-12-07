import { FastifyPluginAsync } from "fastify";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { prisma } from "@evolvx/db";
import crypto from "crypto";
import fs from "fs";

const githubRoutes: FastifyPluginAsync = async (fastify) => {
  // Read private key once at startup
  let privateKey: string;
  try {
    const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH || process.env.GITHUB_APP_PRIVATE_KEY_PATH;
    if (keyPath && fs.existsSync(keyPath)) {
      privateKey = fs.readFileSync(keyPath, 'utf8');
      fastify.log.info('GitHub private key loaded from file');
    } else if (process.env.GITHUB_APP_PRIVATE_KEY) {
      privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
      fastify.log.info('GitHub private key loaded from env variable');
    } else {
      throw new Error('No GitHub private key found (set GITHUB_PRIVATE_KEY_PATH or GITHUB_APP_PRIVATE_KEY)');
    }
  } catch (error) {
    fastify.log.error(error, 'Failed to load GitHub private key');
    privateKey = ''; // Will fail auth but won't crash server
  }

  // Initialize GitHub App
  const getOctokit = () => {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: process.env.GITHUB_APP_ID!,
        privateKey,
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    });
  };

  const getInstallationOctokit = async (installationId: number) => {
    const auth = createAppAuth({
      appId: process.env.GITHUB_APP_ID!,
      privateKey,
    });

    const installationAuthentication = await auth({
      type: "installation",
      installationId,
    });

    return new Octokit({
      auth: installationAuthentication.token,
    });
  };

  // Initiate GitHub App installation
  fastify.post("/install", async (request, reply) => {
    const { organizationId } = request.body as { organizationId: string };

    // Verify organization exists
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      return reply.code(404).send({ error: "Organization not found" });
    }

    // Generate state for CSRF protection and include organizationId
    const randomString = crypto.randomBytes(16).toString("hex");
    const state = `${organizationId}:${randomString}`;

    const installUrl = `https://github.com/apps/${process.env.GITHUB_APP_NAME}/installations/new?state=${state}`;

    return { installUrl, state };
  });

  // Handle OAuth callback (Installation callback)
  fastify.get("/installation/callback", async (request, reply) => {
    const { code, installation_id, setup_action, state } = request.query as {
      code: string;
      installation_id: string;
      setup_action: string;
      state: string;
    };

    if (setup_action !== "install") {
      return reply.code(400).send({ error: "Invalid setup action" });
    }

    try {
      // Extract organizationId from state (format: "orgId:randomString")
      let organizationId = "";
      if (state) {
        const parts = state.split(":");
        if (parts.length > 0) {
          organizationId = parts[0];
        }
      }

      // If no organizationId in state, try to get from authenticated user's first org
      if (!organizationId && request.auth?.userId) {
        const membership = await prisma.member.findFirst({
          where: {
            clerkUserId: request.auth.userId,
            role: "OWNER"
          },
          include: {
            organization: true
          }
        });
        
        if (membership) {
          organizationId = membership.organization.id;
        }
      }

      if (!organizationId) {
        return reply.code(400).send({ 
          error: "No organization found", 
          message: "Please select an organization first" 
        });
      }

      // Get installation details
      const octokit = getOctokit();
      const { data: installation } = await octokit.apps.getInstallation({
        installation_id: parseInt(installation_id),
      });

      // Get installation access token
      const installationOctokit = await getInstallationOctokit(
        parseInt(installation_id)
      );

      // Get installation repositories
      const { data: repos } =
        await installationOctokit.apps.listReposAccessibleToInstallation();

      // Handle account type - it can be User or Organization
      const account = installation.account!;
      const accountLogin = "login" in account ? account.login : account.slug;
      const accountType = "type" in account ? account.type : "Organization";

      // Check if installation already exists
      const existingInstallation = await prisma.gitHubInstallation.findUnique({
        where: { organizationId }
      });

      if (existingInstallation) {
        // Update existing installation
        await prisma.gitHubInstallation.update({
          where: { organizationId },
          data: {
            installationId: installation.id,
            accountId: installation.account!.id,
            accountLogin,
            accountType,
            repositories: {
              deleteMany: {}, // Clear old repos
              create: repos.repositories.map((repo) => ({
                githubRepoId: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                private: repo.private,
                defaultBranch: repo.default_branch || "main",
              })),
            },
          },
        });
      } else {
        // Create new installation
        await prisma.gitHubInstallation.create({
          data: {
            installationId: installation.id,
            accountId: installation.account!.id,
            accountLogin,
            accountType,
            accessToken: "",
            organizationId,
            repositories: {
              create: repos.repositories.map((repo) => ({
                githubRepoId: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                private: repo.private,
                defaultBranch: repo.default_branch || "main",
              })),
            },
          },
        });
      }

      // Redirect to success page
      return reply.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?github=connected`
      );
    } catch (error) {
      fastify.log.error(error);
      return reply
        .code(500)
        .send({ error: "Failed to complete GitHub installation" });
    }
  });

  // Handle GitHub webhooks  
  fastify.post("/webhook", async (request, reply) => {
    const signature = request.headers["x-hub-signature-256"] as string;
    const event = request.headers["x-github-event"] as string;

    // Verify webhook signature
    const hmac = crypto.createHmac(
      "sha256",
      process.env.GITHUB_APP_WEBHOOK_SECRET!
    );
    const digest = `sha256=${hmac.update(JSON.stringify(request.body)).digest("hex")}`;

    if (signature !== digest) {
      return reply.code(401).send({ error: "Invalid signature" });
    }

    // Handle different event types
    const payload = request.body as any;

    switch (event) {
      case "installation":
        // Handle installation created/deleted
        fastify.log.info(
          { event: "installation", action: payload.action },
          "GitHub installation event"
        );
        break;

      case "installation_repositories":
        // Handle repositories added/removed
        fastify.log.info(
          { event: "installation_repositories" },
          "Repositories changed"
        );
        break;

      case "push":
        // Trigger deployment on push to main/master
        if (
          payload.ref === "refs/heads/main" ||
          payload.ref === "refs/heads/master"
        ) {
          const repoFullName = payload.repository.full_name;

          // Find project by repo URL
          const project = await prisma.project.findFirst({
            where: {
              repoUrl: {
                contains: repoFullName,
              },
              deploymentType: "GITHUB_ACTIONS",
            },
            include: {
              organization: true,
            },
          });

          if (project) {
            // Get organization owner to set as deployedBy
            const orgOwner = await prisma.user.findUnique({
              where: { clerkUserId: project.organization.ownerId },
            });

            if (orgOwner) {
              // Create auto-deployment
              await prisma.deployment.create({
                data: {
                  projectId: project.id,
                  version: `auto-${payload.after.substring(0, 7)}`,
                  commitSha: payload.after,
                  branch: payload.ref.replace("refs/heads/", ""),
                  status: "PENDING",
                  deployedBy: orgOwner.id,
                },
              });

              fastify.log.info(
                { projectId: project.id },
                "Auto-deployment created from push"
              );
            }
          }
        }
        break;

      case "workflow_run":
        // Track GitHub Actions workflow runs
        const workflowRunPayload = payload as {
          action: string;
          workflow_run: {
            id: number;
            status: string;
            conclusion: string | null;
            html_url: string;
            head_sha: string;
          };
          repository: {
            full_name: string;
          };
        };

        // Find deployment by commit SHA
        const deployment = await prisma.deployment.findFirst({
          where: {
            commitSha: workflowRunPayload.workflow_run.head_sha,
            project: {
              repoUrl: {
                contains: workflowRunPayload.repository.full_name,
              },
            },
          },
          orderBy: { startedAt: "desc" },
        });

        if (deployment) {
          // Update deployment based on workflow status
          if (workflowRunPayload.workflow_run.status === "completed") {
            const success =
              workflowRunPayload.workflow_run.conclusion === "success";

            await prisma.deployment.update({
              where: { id: deployment.id },
              data: {
                status: success ? "SUCCESS" : "FAILED",
                completedAt: new Date(),
                deployUrl: success
                  ? `https://${deployment.projectId}.evolvx.app`
                  : null,
                errorMessage: success
                  ? null
                  : "Workflow failed. Check GitHub Actions for details.",
                deployLogs: `Workflow run: ${workflowRunPayload.workflow_run.html_url}`,
              },
            });

            fastify.log.info(
              {
                deploymentId: deployment.id,
                status: success ? "SUCCESS" : "FAILED",
              },
              "Deployment updated from workflow run"
            );

            // Store deployment result in Qdrant for AI learning
            const { storeDeploymentLog } = await import("../services/qdrant");
            await storeDeploymentLog({
              deploymentId: deployment.id,
              projectId: deployment.projectId,
              status: success ? "SUCCESS" : "FAILED",
              logs: workflowRunPayload.workflow_run.html_url,
              errorMessage: success ? undefined : "Workflow failed",
            });
          } else if (workflowRunPayload.workflow_run.status === "in_progress") {
            await prisma.deployment.update({
              where: { id: deployment.id },
              data: {
                status: "BUILDING",
                buildLogs: `Workflow running: ${workflowRunPayload.workflow_run.html_url}`,
              },
            });
          }
        }
        break;
    }

    return { received: true };
  });

  // List accessible repositories
  fastify.get("/repos", async (request, reply) => {
    const { organizationId } = request.query as { organizationId: string };

    const installation = await prisma.gitHubInstallation.findUnique({
      where: { organizationId },
      include: { repositories: true },
    });

    if (!installation) {
      return reply.code(404).send({ error: "GitHub not connected" });
    }

    return { repositories: installation.repositories };
  });

  // Push workflow file to repository
  fastify.post("/push-workflow", async (request, reply) => {
    const { projectId, workflowContent } = request.body as {
      projectId: string;
      workflowContent: string;
    };

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        githubRepo: {
          include: { installation: true },
        },
      },
    });

    if (!project || !project.githubRepo) {
      return reply.code(404).send({ error: "Project or repository not found" });
    }

    try {
      const octokit = await getInstallationOctokit(
        project.githubRepo.installation.installationId
      );

      const [owner, repo] = project.githubRepo.fullName.split("/");

      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: ".github/workflows/evolvx-deploy.yml",
        message: "Add Evolvx deployment workflow",
        content: Buffer.from(workflowContent).toString("base64"),
      });

      return { success: true, message: "Workflow pushed successfully" };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to push workflow" });
    }
  });

  // Set GitHub Action secrets
  fastify.post("/set-secrets", async (request, reply) => {
    const { projectId, secrets } = request.body as {
      projectId: string;
      secrets: Record<string, string>;
    };

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        githubRepo: {
          include: { installation: true },
        },
      },
    });

    if (!project || !project.githubRepo) {
      return reply.code(404).send({ error: "Project or repository not found" });
    }

    try {
      const octokit = await getInstallationOctokit(
        project.githubRepo.installation.installationId
      );

      const [owner, repo] = project.githubRepo.fullName.split("/");

      // Get repository public key for encrypting secrets
      const { data: publicKey } = await octokit.actions.getRepoPublicKey({
        owner,
        repo,
      });

      // Encrypt and set each secret
      for (const [name, value] of Object.entries(secrets)) {
        const encryptedValue = await encryptGitHubSecret(publicKey.key, value);

        await octokit.actions.createOrUpdateRepoSecret({
          owner,
          repo,
          secret_name: name,
          encrypted_value: encryptedValue,
          key_id: publicKey.key_id,
        });
      }

      return { success: true, message: "Secrets configured successfully" };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to set secrets" });
    }
  });

  // Get repositories accessible to installation
  fastify.get(
    "/repositories",
    {
      preHandler: [
        async (request, reply) => {
          const { requireAuth } = await import("../middleware/auth");
          await requireAuth(request, reply);
        },
      ],
    },
    async (request, reply) => {
      try {
        // Get user's organization (you might want to pass this as a query param)
        const memberships = await prisma.member.findMany({
          where: {
            clerkUserId: request.auth!.userId,
          },
          include: {
            organization: {
              include: {
                githubInstallation: {
                  include: {
                    repositories: true,
                  },
                },
              },
            },
          },
        });

        if (memberships.length === 0) {
          return { needsInstallation: true, repositories: [] };
        }

        // Get first organization's GitHub installation
        const org = memberships[0].organization;
        const installation = org.githubInstallation;

        if (!installation) {
          return { needsInstallation: true, repositories: [] };
        }

        // Return repositories
        const repositories = installation.repositories.map((repo: any) => ({
          id: repo.id,
          githubRepoId: repo.githubRepoId,
          name: repo.name,
          fullName: repo.fullName,
          url: `https://github.com/${repo.fullName}`,
          private: repo.private,
          defaultBranch: repo.defaultBranch,
        }));

        return {
          needsInstallation: false,
          repositories,
        };
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: "Failed to fetch repositories" });
      }
    }
  );
};

// Helper function to encrypt secrets using libsodium (sealed box)
async function encryptGitHubSecret(
  publicKey: string,
  secret: string
): Promise<string> {
  const { encryptGitHubSecret: encrypt } = await import("@evolvx/shared");
  return encrypt(publicKey, secret);
}

export default githubRoutes;
