import { FastifyPluginAsync } from "fastify";
import { prisma } from "@evolvx/db";
import { requireAuth, requireOrganization } from "../middleware/auth";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate";
import {
  createProjectSchema,
  updateProjectSchema,
  addSecretSchema,
  idParamSchema,
  organizationIdQuerySchema,
} from "@evolvx/shared";
import { encrypt, decrypt } from "@evolvx/shared";
import slugify from "slugify";
import { nanoid } from "nanoid";

const projectRoutes: FastifyPluginAsync = async (fastify) => {
  // Create project
  fastify.post(
    "/",
    {
      preHandler: [requireAuth, validateBody(createProjectSchema)],
    },
    async (request, reply) => {
      const {
        name,
        organizationId,
        repoUrl,
        deploymentType,
        framework,
        buildCommand,
        startCommand,
      } = request.body as any;

      // Verify user has access to this organization
      const member = await prisma.member.findFirst({
        where: {
          organizationId,
          clerkUserId: request.auth!.userId,
        },
      });

      if (!member) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "You do not have access to this organization",
        });
      }

      const orgId = organizationId;

      // Generate unique slug
      const baseSlug = slugify(name, { lower: true, strict: true });
      const slug = `${baseSlug}-${nanoid(6)}`;

      // Check if user has GitHub installation for this org
      if (repoUrl.includes("github.com")) {
        const installation = await prisma.gitHubInstallation.findUnique({
          where: { organizationId: orgId },
          include: { repositories: true },
        });

        if (!installation) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Please connect your GitHub account first",
            action: "CONNECT_GITHUB",
          });
        }

        // Check if repo is accessible
        const repoName = repoUrl
          .replace("https://github.com/", "")
          .replace(".git", "");
        const hasAccess = installation.repositories.some(
          (r: { fullName: string }) => r.fullName === repoName
        );

        if (!hasAccess) {
          return reply.code(403).send({
            error: "Forbidden",
            message:
              "Repository not accessible. Please grant access via GitHub App",
            availableRepos: installation.repositories.map(
              (r: { fullName: string }) => r.fullName
            ),
          });
        }
      }

      // Create project
      const project = await prisma.project.create({
        data: {
          name,
          slug,
          organizationId: orgId,
          repoUrl,
          deploymentType,
          framework,
          buildCommand,
          startCommand,
          status: "ANALYZING",
        },
      });

      // Trigger repository analysis in background
      try {
        const { analyzeAndStore } = await import("../services/repo-analyzer");
        const githubInstallation = await prisma.gitHubInstallation.findUnique({
          where: { organizationId: orgId },
        });

        // Run analysis asynchronously
        analyzeAndStore(project.id, repoUrl, githubInstallation?.installationId)
          .then(async (analysis) => {
            // Update project with detected values
            await prisma.project.update({
              where: { id: project.id },
              data: {
                framework: analysis.framework || framework,
                buildCommand: analysis.buildCommand || buildCommand,
                startCommand: analysis.startCommand || startCommand,
                status: "CONFIGURED",
              },
            });
          })
          .catch((error) => {
            fastify.log.error({ err: error }, "Failed to analyze repository");
            // Update status to failed
            prisma.project.update({
              where: { id: project.id },
              data: { status: "FAILED" },
            });
          });
      } catch (error) {
        fastify.log.error(
          { err: error },
          "Failed to start repository analysis"
        );
      }

      return { project };
    }
  );

  // List projects
  fastify.get(
    "/",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      // Get all organizations the user is a member of
      const memberships = await prisma.member.findMany({
        where: {
          clerkUserId: request.auth!.userId,
        },
        select: {
          organizationId: true,
        },
      });

      const orgIds = memberships.map((m: any) => m.organizationId);

      const projects = await prisma.project.findMany({
        where: {
          organizationId: { in: orgIds },
        },
        include: {
          _count: {
            select: { deployments: true, secrets: true },
          },
          deployments: {
            where: { status: "SUCCESS" },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: {
              id: true,
              version: true,
              deployUrl: true,
              startedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return { projects };
    }
  );

  // Get project details
  fastify.get(
    "/:id",
    {
      preHandler: [requireAuth, validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          organization: {
            include: {
              members: {
                where: { clerkUserId: request.auth!.userId },
              },
            },
          },
          githubRepo: {
            include: {
              installation: true,
            },
          },
          deployments: {
            orderBy: { startedAt: "desc" },
            take: 10,
          },
          pipelines: true,
          metrics: {
            orderBy: { timestamp: "desc" },
            take: 100,
          },
        },
      });

      if (!project) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Project not found",
        });
      }

      // Check if user has access
      if (project.organization.members.length === 0) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "You do not have access to this project",
        });
      }

      return { project };
    }
  );

  // Update project
  fastify.patch(
    "/:id",
    {
      preHandler: [
        requireAuth,
        validateParams(idParamSchema),
        validateBody(updateProjectSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const updates = request.body as any;

      // Verify access
      const project = await prisma.project.findUnique({
        where: { id },
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
        return reply.code(404).send({
          error: "Not Found",
          message: "Project not found or access denied",
        });
      }

      const updated = await prisma.project.update({
        where: { id },
        data: updates,
      });

      return { project: updated };
    }
  );

  // Delete project
  fastify.delete(
    "/:id",
    {
      preHandler: [requireAuth, validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Verify access and ownership (only OWNER/ADMIN can delete)
      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          organization: {
            include: {
              members: {
                where: {
                  clerkUserId: request.auth!.userId,
                  role: { in: ["OWNER", "ADMIN"] },
                },
              },
            },
          },
        },
      });

      if (!project || project.organization.members.length === 0) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Project not found or insufficient permissions",
        });
      }

      await prisma.project.delete({
        where: { id },
      });

      return { success: true, message: "Project deleted successfully" };
    }
  );

  // Add/Update secret
  fastify.post(
    "/:id/secrets",
    {
      preHandler: [
        requireAuth,
        validateParams(idParamSchema),
        validateBody(addSecretSchema),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { key, value, environment = "production" } = request.body as any;

      // Verify access
      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          organization: {
            include: {
              members: {
                where: { userId: request.auth!.userId },
              },
            },
          },
        },
      });

      if (!project || project.organization.members.length === 0) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Project not found or access denied",
        });
      }

      // Encrypt the secret value
      const encryptedValue = encrypt(value);

      // Upsert secret
      const secret = await prisma.secret.upsert({
        where: {
          projectId_key_environment: {
            projectId: id,
            key,
            environment,
          },
        },
        update: {
          value: encryptedValue,
          updatedAt: new Date(),
        },
        create: {
          projectId: id,
          key,
          value: encryptedValue,
          environment,
        },
      });

      return {
        success: true,
        message: "Secret saved successfully",
        secret: {
          id: secret.id,
          key: secret.key,
          createdAt: secret.createdAt,
          updatedAt: secret.updatedAt,
        },
      };
    }
  );

  // List secrets (keys only, not values)
  fastify.get(
    "/:id/secrets",
    {
      preHandler: [requireAuth, validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Verify access
      const project = await prisma.project.findUnique({
        where: { id },
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
        return reply.code(404).send({
          error: "Not Found",
          message: "Project not found or access denied",
        });
      }

      const secrets = await prisma.secret.findMany({
        where: { projectId: id },
        select: {
          id: true,
          key: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { key: "asc" },
      });

      return { secrets };
    }
  );

  // Delete secret
  fastify.delete(
    "/:id/secrets/:secretId",
    {
      preHandler: [requireAuth, validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const { id, secretId } = request.params as {
        id: string;
        secretId: string;
      };

      // Verify secret belongs to project and user has access
      const secret = await prisma.secret.findUnique({
        where: { id: secretId },
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

      if (
        !secret ||
        secret.projectId !== id ||
        secret.project.organization.members.length === 0
      ) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Secret not found or access denied",
        });
      }

      await prisma.secret.delete({
        where: { id: secretId },
      });

      return { success: true, message: "Secret deleted successfully" };
    }
  );
};

export default projectRoutes;
