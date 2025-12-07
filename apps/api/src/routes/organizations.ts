import { FastifyPluginAsync } from "fastify";
import { prisma } from "@evolvx/db";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  idParamSchema,
  organizationIdQuerySchema,
} from "@evolvx/shared";
import slugify from "slugify";
import { clerkClient } from "@clerk/fastify";

const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  // Create organization
  fastify.post(
    "/",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const { name, slug } = request.body as any;
      const userId = request.auth!.userId;

      // Check if org with slug already exists
      const existing = await prisma.organization.findUnique({
        where: { slug },
      });

      if (existing) {
        return reply.code(409).send({
          error: "Conflict",
          message: "An organization with this slug already exists",
        });
      }

      // Get user from database first
      const dbUser = await prisma.user.findUnique({
        where: { clerkUserId: userId },
      });

      if (!dbUser) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "User not found in database",
        });
      }

      // Create organization with auto-generated IDs
      const org = await prisma.organization.create({
        data: {
          name,
          slug,
          clerkOrgId: `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ownerId: userId,
          members: {
            create: {
              userId: dbUser.id,
              clerkUserId: userId,
              email: dbUser.email,
              role: "OWNER",
              joinedAt: new Date(),
            },
          },
          subscription: {
            create: {
              plan: "FREE",
              status: "ACTIVE",
            },
          },
        },
        include: {
          members: true,
          subscription: true,
        },
      });

      return { organization: org };
    }
  );

  // Sync user from Clerk if not exists (helper for first-time users)
  fastify.post(
    "/sync-user",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.auth!.userId;

      try {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
          where: { clerkUserId: userId },
        });

        if (existingUser) {
          return { user: existingUser, synced: false };
        }

        // Get user from Clerk
        const clerkUser = await clerkClient.users.getUser(userId);
        const primaryEmail = clerkUser.emailAddresses.find(
          (email) => email.id === clerkUser.primaryEmailAddressId
        );

        if (!primaryEmail?.emailAddress) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "No primary email found",
          });
        }

        // Create user in database
        const newUser = await prisma.user.create({
          data: {
            clerkUserId: userId,
            email: primaryEmail.emailAddress,
            firstName: clerkUser.firstName || null,
            lastName: clerkUser.lastName || null,
            imageUrl: clerkUser.imageUrl || null,
          },
        });

        fastify.log.info(`User ${userId} synced from Clerk`);
        return { user: newUser, synced: true };
      } catch (error) {
        fastify.log.error({ error }, "Failed to sync user");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to sync user",
        });
      }
    }
  );

  // List organizations for current user
  fastify.get(
    "/",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.auth!.userId;

      const memberships = await prisma.member.findMany({
        where: { clerkUserId: userId },
        include: {
          organization: {
            include: {
              _count: {
                select: { projects: true, members: true },
              },
              subscription: true,
            },
          },
        },
      });

      const orgs = memberships.map((m: { organization: any; role: any }) => ({
        ...m.organization,
        role: m.role,
      }));

      return { organizations: orgs };
    }
  );

  // Get organization by ID
  fastify.get(
    "/:id",
    {
      preHandler: [requireAuth, validateParams(idParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const org = await prisma.organization.findUnique({
        where: { id },
        include: {
          members: {
            orderBy: { joinedAt: "asc" },
          },
          projects: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              framework: true,
              createdAt: true,
            },
          },
          subscription: true,
          githubInstallation: {
            select: {
              id: true,
              accountLogin: true,
              accountType: true,
              repositories: {
                select: {
                  id: true,
                  name: true,
                  fullName: true,
                  private: true,
                },
              },
            },
          },
        },
      });

      if (!org) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Organization not found",
        });
      }

      // Check if user is a member
      const isMember = org.members.some(
        (m: { clerkUserId: string }) => m.clerkUserId === request.auth!.userId
      );
      if (!isMember) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "You are not a member of this organization",
        });
      }

      return { organization: org };
    }
  );

  // Invite member to organization
  fastify.post(
    "/:id/invite",
    {
      preHandler: [
        requireAuth,
        validateParams(idParamSchema),
        validateBody(inviteMemberSchema),
        requireRole(["OWNER", "ADMIN"]),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { email, role } = request.body as any;

      // Check if member already exists
      const existing = await prisma.member.findFirst({
        where: {
          organizationId: id,
          email,
        },
      });

      if (existing) {
        return reply.code(409).send({
          error: "Conflict",
          message: "User is already a member or has been invited",
        });
      }

      // Create invitation
      const member = await prisma.member.create({
        data: {
          organizationId: id,
          userId: "", // Will be filled when they accept
          clerkUserId: "", // Will be filled when they accept
          email,
          role,
          // joinedAt will be null until they accept
        },
      });

      // TODO: Send invitation email using Clerk or email service

      return {
        success: true,
        message: "Invitation sent successfully",
        member,
      };
    }
  );

  // Update member role
  fastify.patch(
    "/:id/members/:memberId",
    {
      preHandler: [
        requireAuth,
        validateParams(idParamSchema),
        validateBody(updateMemberRoleSchema),
        requireRole(["OWNER", "ADMIN"]),
      ],
    },
    async (request, reply) => {
      const { id, memberId } = request.params as {
        id: string;
        memberId: string;
      };
      const { role } = request.body as any;

      const member = await prisma.member.findUnique({
        where: { id: memberId },
      });

      if (!member || member.organizationId !== id) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Member not found",
        });
      }

      // Prevent demoting the last owner
      if (member.role === "OWNER") {
        const ownerCount = await prisma.member.count({
          where: { organizationId: id, role: "OWNER" },
        });

        if (ownerCount === 1) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Cannot change role of the last owner",
          });
        }
      }

      const updated = await prisma.member.update({
        where: { id: memberId },
        data: { role },
      });

      return { member: updated };
    }
  );

  // Remove member from organization
  fastify.delete(
    "/:id/members/:memberId",
    {
      preHandler: [
        requireAuth,
        validateParams(idParamSchema),
        requireRole(["OWNER", "ADMIN"]),
      ],
    },
    async (request, reply) => {
      const { id, memberId } = request.params as {
        id: string;
        memberId: string;
      };

      const member = await prisma.member.findUnique({
        where: { id: memberId },
      });

      if (!member || member.organizationId !== id) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Member not found",
        });
      }

      // Prevent removing the last owner
      if (member.role === "OWNER") {
        const ownerCount = await prisma.member.count({
          where: { organizationId: id, role: "OWNER" },
        });

        if (ownerCount === 1) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Cannot remove the last owner",
          });
        }
      }

      await prisma.member.delete({
        where: { id: memberId },
      });

      return { success: true, message: "Member removed successfully" };
    }
  );

  // Delete organization
  fastify.delete(
    "/:id",
    {
      preHandler: [
        requireAuth,
        validateParams(idParamSchema),
        requireRole(["OWNER"]),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      await prisma.organization.delete({
        where: { id },
      });

      return { success: true, message: "Organization deleted successfully" };
    }
  );
};

export default organizationRoutes;
