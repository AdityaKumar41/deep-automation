import { FastifyInstance, FastifyRequest } from "fastify";
import { verifyWebhook, WebhookEvent } from "@clerk/backend/webhooks";
import { prisma as db } from "@evolvx/db";

import polarWebhookRoutes from "./webhooks/polar";

export default async function webhookRoutes(fastify: FastifyInstance) {
  // Polar webhook handler  
  await fastify.register(polarWebhookRoutes);

  // GitHub webhook handler (no auth)
  // Import and register just the webhook handler
  const githubWebhookHandler = async (request: any, reply: any) => {
    const crypto = await import("crypto");
    const { prisma } = await import("@evolvx/db");
    
    const signature = request.headers["x-hub-signature-256"] as string;
    const event = request.headers["x-github-event"] as string;

    // Verify webhook signature
    const hmac = crypto.createHmac(
      "sha256",
      process.env.GITHUB_WEBHOOK_SECRET!
    );
    const digest = `sha256=${hmac.update(JSON.stringify(request.body)).digest("hex")}`;

    if (signature !== digest) {
      return reply.code(401).send({ error: "Invalid signature" });
    }

    // Handle different event types
    const payload = request.body as any;

    switch (event) {
      case "installation":
        fastify.log.info(
          { event: "installation", action: payload.action },
          "GitHub installation event"
        );
        break;

      case "installation_repositories":
        fastify.log.info(
          { event: "installation_repositories" },
          "Repositories changed"
        );
        break;

      case "push":
        // Handle push events
        if (
          payload.ref === "refs/heads/main" ||
          payload.ref === "refs/heads/master"
        ) {
          const repoFullName = payload.repository.full_name;
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
            const orgOwner = await prisma.user.findUnique({
              where: { clerkUserId: project.organization.ownerId },
            });

            if (orgOwner) {
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
        // Handle workflow run events
        const deployment = await prisma.deployment.findFirst({
          where: {
            commitSha: payload.workflow_run.head_sha,
            project: {
              repoUrl: {
                contains: payload.repository.full_name,
              },
            },
          },
          orderBy: { startedAt: "desc" },
        });

        if (deployment && payload.workflow_run.status === "completed") {
          const success = payload.workflow_run.conclusion === "success";
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
              deployLogs: `Workflow run: ${payload.workflow_run.html_url}`,
            },
          });
        }
        break;
    }

    return { received: true };
  };

  fastify.post("/webhooks/github", githubWebhookHandler);

  // Clerk webhook handler
  fastify.post("/webhooks/clerk", async (request, reply) => {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

    if (!WEBHOOK_SECRET) {
      fastify.log.error("CLERK_WEBHOOK_SIGNING_SECRET not configured");
      return reply.code(500).send({ error: "Webhook secret not configured" });
    }

    let evt: WebhookEvent;

    // Verify the webhook using @clerk/backend
    // Convert Fastify request to Web Request for Clerk's verifyWebhook
    try {
      const payload = JSON.stringify(request.body);
      const headers = new Headers();

      // Copy all headers from Fastify request
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
      });

      // Create a Web Request object
      const webRequest = new Request(
        `${request.protocol}://${request.hostname}${request.url}`,
        {
          method: request.method,
          headers: headers,
          body: payload,
        }
      );

      evt = await verifyWebhook(webRequest, {
        signingSecret: WEBHOOK_SECRET,
      });
    } catch (err) {
      fastify.log.error({ err }, "Failed to verify Clerk webhook");
      return reply.code(400).send({ error: "Invalid webhook" });
    }

    // Handle the webhook
    const eventType = evt.type;
    fastify.log.info(`Received Clerk webhook: ${eventType}`);

    try {
      switch (eventType) {
        case "user.created":
        case "user.updated": {
          const { id, email_addresses, first_name, last_name, image_url } =
            evt.data;

          const primaryEmail = email_addresses.find(
            (email) => email.id === evt.data.primary_email_address_id
          );

          if (!primaryEmail?.email_address) {
            fastify.log.error("No primary email found for user");
            return reply.code(400).send({ error: "No primary email" });
          }

          await db.user.upsert({
            where: { clerkUserId: id },
            update: {
              email: primaryEmail.email_address,
              firstName: first_name || null,
              lastName: last_name || null,
              imageUrl: image_url || null,
            },
            create: {
              clerkUserId: id,
              email: primaryEmail.email_address,
              firstName: first_name || null,
              lastName: last_name || null,
              imageUrl: image_url || null,
            },
          });

          fastify.log.info(`User ${id} synced to database`);
          break;
        }

        case "user.deleted": {
          const { id } = evt.data;

          if (id) {
            await db.user.delete({
              where: { clerkUserId: id },
            });
            fastify.log.info(`User ${id} deleted from database`);
          }
          break;
        }

        case "organization.created":
        case "organization.updated": {
          const { id, name, slug, created_by } = evt.data;

          if (!created_by) {
            fastify.log.error("No creator ID in organization event");
            break;
          }

          // Check if organization already exists
          const existingOrg = await db.organization.findUnique({
            where: { clerkOrgId: id },
          });

          if (!existingOrg) {
            // Create organization
            const org = await db.organization.create({
              data: {
                clerkOrgId: id,
                name,
                slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
                ownerId: created_by,
              },
            });

            // Create owner membership
            const user = await db.user.findUnique({
              where: { clerkUserId: created_by },
            });

            if (user) {
              await db.member.create({
                data: {
                  organizationId: org.id,
                  userId: user.id,
                  clerkUserId: created_by,
                  email: user.email,
                  role: "OWNER",
                  joinedAt: new Date(),
                },
              });
            }

            // Create free subscription
            await db.subscription.create({
              data: {
                organizationId: org.id,
                plan: "FREE",
                status: "ACTIVE",
              },
            });

            fastify.log.info(`Organization ${id} created in database`);
          } else {
            // Update organization
            await db.organization.update({
              where: { clerkOrgId: id },
              data: {
                name,
                slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
              },
            });
            fastify.log.info(`Organization ${id} updated in database`);
          }
          break;
        }

        case "organization.deleted": {
          const { id } = evt.data;

          if (id) {
            await db.organization.delete({
              where: { clerkOrgId: id },
            });
            fastify.log.info(`Organization ${id} deleted from database`);
          }
          break;
        }

        case "organizationMembership.created":
        case "organizationMembership.updated": {
          const { organization, public_user_data, role } = evt.data;

          if (!organization?.id || !public_user_data?.user_id) {
            break;
          }

          // Find the organization by Clerk ID
          const org = await db.organization.findUnique({
            where: { clerkOrgId: organization.id },
          });

          if (!org) {
            fastify.log.error(`Organization ${organization.id} not found`);
            break;
          }

          const user = await db.user.findUnique({
            where: { clerkUserId: public_user_data.user_id },
          });

          if (!user) {
            fastify.log.error(`User ${public_user_data.user_id} not found`);
            break;
          }

          // Map Clerk roles to our MemberRole enum
          let memberRole: "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER" =
            "DEVELOPER";
          if (role === "org:admin") memberRole = "ADMIN";
          else if (role === "org:member") memberRole = "DEVELOPER";

          await db.member.upsert({
            where: {
              organizationId_userId: {
                organizationId: org.id,
                userId: user.id,
              },
            },
            update: {
              role: memberRole,
              email: public_user_data.identifier,
            },
            create: {
              organizationId: org.id,
              userId: user.id,
              clerkUserId: public_user_data.user_id,
              email: public_user_data.identifier,
              role: memberRole,
              joinedAt: new Date(),
            },
          });

          fastify.log.info(
            `Membership updated for user ${user.id} in org ${org.id}`
          );
          break;
        }

        case "organizationMembership.deleted": {
          const { organization, public_user_data } = evt.data;

          if (!organization?.id || !public_user_data?.user_id) {
            break;
          }

          // Find the organization by Clerk ID
          const org = await db.organization.findUnique({
            where: { clerkOrgId: organization.id },
          });

          if (!org) {
            fastify.log.error(`Organization ${organization.id} not found`);
            break;
          }

          const user = await db.user.findUnique({
            where: { clerkUserId: public_user_data.user_id },
          });

          if (user) {
            await db.member.delete({
              where: {
                organizationId_userId: {
                  organizationId: org.id,
                  userId: user.id,
                },
              },
            });
            fastify.log.info(
              `Membership deleted for user ${user.id} in org ${org.id}`
            );
          }
          break;
        }

        default:
          fastify.log.info(`Unhandled webhook event type: ${eventType}`);
      }

      return reply.code(200).send({ received: true });
    } catch (error) {
      fastify.log.error({ error }, "Error processing webhook");
      return reply.code(500).send({ error: "Internal server error" });
    }
  });
}
