import { FastifyPluginAsync } from "fastify";
import { prisma } from "@evolvx/db";
import { Webhooks } from "@polar-sh/fastify";

const polarWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Using Polar's Fastify adapter for automatic webhook validation
  fastify.post(
    "/polar",
    Webhooks({
      webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
      onSubscriptionCreated: async (payload) => {
        fastify.log.info({ type: "subscription.created" }, "Polar webhook received");
        await handleSubscriptionEvent(payload, fastify);
      },
      onSubscriptionUpdated: async (payload) => {
        fastify.log.info({ type: "subscription.updated" }, "Polar webhook received");
        await handleSubscriptionEvent(payload, fastify);
      },
      onSubscriptionActive: async (payload) => {
        fastify.log.info({ type: "subscription.active" }, "Polar webhook received");
        await handleSubscriptionEvent(payload, fastify);
      },
      onSubscriptionCanceled: async (payload) => {
        fastify.log.info({ type: "subscription.canceled" }, "Polar webhook received");
        
        const organizationId = payload.data.metadata?.organizationId as string;
        
        if (organizationId) {
          await prisma.subscription.update({
            where: { organizationId },
            data: {
              status: "CANCELED",
              cancelAtPeriodEnd: true,
            },
          });
          fastify.log.info(`Canceled subscription for org ${organizationId}`);
        }
      },
      onSubscriptionRevoked: async (payload) => {
        fastify.log.info({ type: "subscription.revoked" }, "Polar webhook received");
        
        const organizationId = payload.data.metadata?.organizationId as string;
        
        if (organizationId) {
          await prisma.subscription.update({
            where: { organizationId },
            data: {
              status: "CANCELED",
            },
          });
          fastify.log.info(`Revoked subscription for org ${organizationId}`);
        }
      },
    })
  );
};

async function handleSubscriptionEvent(payload: any, fastify: any) {
  try {
    const subscription = payload.data;
    const organizationId = subscription.metadata?.organizationId;

    if (!organizationId) {
      fastify.log.warn("Subscription webhook missing organizationId metadata");
      return;
    }

    // Map product ID to plan
    let plan: "FREE" | "PRO" | "TEAM" = "FREE";
    const productId = subscription.product_id;

    if (productId === process.env.POLAR_PRODUCT_ID_FREE) {
      plan = "FREE";
    } else if (productId === process.env.POLAR_PRODUCT_ID_PRO_MONTHLY) {
      plan = "PRO";
    } else if (productId === process.env.POLAR_PRODUCT_ID_TEAM_MONTHLY) {
      plan = "TEAM";
    }

    // Map Polar status to our status
    let status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING" | "INCOMPLETE" = "ACTIVE";
    if (subscription.status === "active") status = "ACTIVE";
    else if (subscription.status === "past_due") status = "PAST_DUE";
    else if (subscription.status === "canceled") status = "CANCELED";
    else if (subscription.status === "incomplete") status = "INCOMPLETE";
    else if (subscription.status === "trialing") status = "TRIALING";

    await prisma.subscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        polarSubscriptionId: subscription.id,
        polarCustomerId: subscription.customer_id,
        plan,
        status,
        currentPeriodStart: new Date(subscription.current_period_start),
        currentPeriodEnd: new Date(subscription.current_period_end),
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      },
      update: {
        polarSubscriptionId: subscription.id,
        polarCustomerId: subscription.customer_id,
        plan,
        status,
        currentPeriodStart: new Date(subscription.current_period_start),
        currentPeriodEnd: new Date(subscription.current_period_end),
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      },
    });

    fastify.log.info(`Updated subscription for org ${organizationId} to ${plan} (${status})`);
  } catch (error) {
    fastify.log.error(error, "Error processing subscription webhook");
    throw error;
  }
}

export default polarWebhookRoutes;
