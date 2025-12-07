import { FastifyPluginAsync } from "fastify";
import { prisma } from "@evolvx/db";
import { requireAuth } from "../../middleware/auth";
import { getPolarClient, POLAR_PRODUCT_IDS } from "../../services/polar";

const billingRoutes: FastifyPluginAsync = async (fastify) => {
  // Create Checkout Session
  fastify.post(
    "/checkout",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const { organizationId, productId } = request.body as any;
      const userId = request.auth!.userId;
      
      // Verify user is owner
      const isOwner = await prisma.member.findFirst({
        where: {
            clerkUserId: userId,
            organizationId,
            role: "OWNER"
        }
      });

      if (!isOwner) {
        return reply.code(403).send({ error: "Forbidden", message: "Only owners can manage billing" });
      }

      const polar = getPolarClient();
      
      try {
          // Create custom checkout with metadata for webhook
          // Note: metadata is supported by Polar API but may not be in SDK types yet
          const result = await polar.checkouts.create({
            productPriceId: productId,
            customerEmail: isOwner.email,
            metadata: {
                organizationId: organizationId,
                clerkUserId: userId
            },
            successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
          } as any);

          return { url: result.url };
      } catch (error: any) {
          fastify.log.error(error, "Failed to create checkout");
          return reply.code(500).send({ 
            error: "Internal Server Error", 
            message: error.message || "Failed to create checkout session" 
          });
      }
    }
  );

  // Get Customer Portal Link
  fastify.get(
    "/portal/:organizationId",
    {
        preHandler: [requireAuth],
    },
    async (request, reply) => {
        const { organizationId } = request.params as { organizationId: string };
        const userId = request.auth!.userId;

        const isOwner = await prisma.member.findFirst({
            where: {
                clerkUserId: userId,
                organizationId,
                role: "OWNER"
            }
        });

        if (!isOwner) {
            return reply.code(403).send({ error: "Forbidden", message: "Only owners can manage billing" });
        }
        
        const subscription = await prisma.subscription.findUnique({
            where: { organizationId }
        });

        if (!subscription?.polarCustomerId) {
             return reply.code(404).send({ error: "Not Found", message: "No active billing subscription found" });
        }

        const polar = getPolarClient();
        const polarAny = polar as any;
        const result = await polarAny.customerPortal.sessions.create({
            customerId: subscription.polarCustomerId,
        });

        return { url: result.url };
    }
  );

  // Get Usage Stats
  fastify.get(
    "/usage/:organizationId",
    {
        preHandler: [requireAuth],
    },
    async (request, reply) => {
        const { organizationId } = request.params as { organizationId: string };
        const userId = request.auth!.userId;

        const member = await prisma.member.findFirst({
            where: {
                clerkUserId: userId,
                organizationId
            }
        });

        if (!member) {
            return reply.code(403).send({ error: "Forbidden", message: "Not a member of this organization" });
        }

        const subscription = await prisma.subscription.findUnique({
            where: { organizationId },
            include: { usage: true } 
        });

        if (!subscription) {
             return {
                deployments: 0,
                buildMinutes: 0,
                storageGB: 0,
                bandwidthGB: 0,
                aiRequests: 0
            };
        }

        const now = new Date();
        const start = subscription.currentPeriodStart || new Date(now.getFullYear(), now.getMonth(), 1); 
        
        const usageRecords = await prisma.usage.findMany({
            where: {
                subscriptionId: subscription.id,
                timestamp: {
                    gte: start
                }
            }
        });

        const usageStats = {
            deployments: 0,
            buildMinutes: 0,
            storageGB: 0,
            bandwidthGB: 0,
            aiRequests: 0,
        };

        usageRecords.forEach(r => {
            switch(r.metric) {
                case "DEPLOYMENTS": usageStats.deployments += r.quantity; break;
                case "BUILD_MINUTES": usageStats.buildMinutes += r.quantity; break;
                case "STORAGE_GB": usageStats.storageGB = Math.max(usageStats.storageGB, r.quantity); break;
                case "BANDWIDTH_GB": usageStats.bandwidthGB += r.quantity; break;
            }
        });

        return usageStats;
    }
  );
};

export default billingRoutes;
