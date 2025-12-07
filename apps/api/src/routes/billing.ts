import { FastifyPluginAsync } from 'fastify';
import { Polar } from '@polar-sh/sdk';
import { prisma } from '@evolvx/db';
import { PLAN_LIMITS } from '@evolvx/shared';
import crypto from 'crypto';

const billingRoutes: FastifyPluginAsync = async (fastify) => {
  const polar = new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
  });

  // Create checkout session
  fastify.post('/checkout', async (request, reply) => {
    const { organizationId, plan } = request.body as {
      organizationId: string;
      plan: 'PRO' | 'TEAM';
    };

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { members: { where: { role: 'OWNER' } } },
    });

    if (!org) {
      return reply.code(404).send({ error: 'Organization not found' });
    }

    const priceId =
      plan === 'PRO'
        ? process.env.POLAR_PRICE_ID_PRO!
        : process.env.POLAR_PRICE_ID_TEAM!;

    try {
      // Note: Polar SDK checkout.create may not support metadata in this version
      // Store organizationId mapping separately if needed
      const checkout = await polar.checkouts.create({
        productPriceId: priceId,
        successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true&org=${organizationId}&plan=${plan}`,
      });

      return { checkoutUrl: checkout.url };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create checkout session' });
    }
  });

  // Get customer portal URL
  fastify.post('/portal', async (request, reply) => {
    const { organizationId } = request.body as { organizationId: string };

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!subscription || !subscription.polarCustomerId) {
      return reply.code(404).send({ error: 'No active subscription found' });
    }

    try {
      // Polar customer portal URL
      const portalUrl = `https://polar.sh/dashboard/subscriptions`;
      return { portalUrl };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to get portal URL' });
    }
  });

  // Handle Polar webhooks
  fastify.post('/webhook', async (request, reply) => {
    const signature = request.headers['x-polar-signature'] as string;
    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET!;

    // Verify webhook signature
    const hmac = crypto.createHmac('sha256', webhookSecret);
    const digest = hmac.update(JSON.stringify(request.body)).digest('hex');

    if (signature !== digest) {
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    const event = request.body as any;

    try {
      switch (event.type) {
        case 'subscription.created':
          await handleSubscriptionCreated(event.data);
          break;
        case 'subscription.updated':
          await handleSubscriptionUpdated(event.data);
          break;
        case 'subscription.canceled':
          await handleSubscriptionCanceled(event.data);
          break;
        case 'payment.succeeded':
          await handlePaymentSucceeded(event.data);
          break;
      }

      return { received: true };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Webhook processing failed' });
    }
  });

  // Get subscription details
  fastify.get('/subscription', async (request, reply) => {
    const { organizationId } = request.query as { organizationId: string };

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      include: { usage: true },
    });

    if (!subscription) {
      // Create free tier subscription
      const newSubscription = await prisma.subscription.create({
        data: {
          organizationId,
          plan: 'FREE',
          status: 'ACTIVE',
        },
      });
      return { subscription: newSubscription };
    }

    return { subscription };
  });

  // Report usage
  fastify.post('/usage', async (request, reply) => {
    const { organizationId, metric, quantity } = request.body as {
      organizationId: string;
      metric: 'DEPLOYMENTS' | 'BUILD_MINUTES' | 'STORAGE_GB' | 'BANDWIDTH_GB';
      quantity: number;
    };

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!subscription) {
      return reply.code(404).send({ error: 'Subscription not found' });
    }

    const billingPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Record usage locally
    await prisma.usage.create({
      data: {
        subscriptionId: subscription.id,
        metric,
        quantity,
        billingPeriod,
      },
    });

    // Report to Polar if applicable
    if (subscription.polarSubscriptionId) {
      try {
        // Polar usage reporting (if they support it)
        // await polar.subscriptions.reportUsage({...});
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to report usage to Polar');
      }
    }

    return { success: true };
  });

  // Check usage limits
  fastify.get('/limits', async (request, reply) => {
    const { organizationId } = request.query as { organizationId: string };

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      include: { usage: true },
    });

    if (!subscription) {
      return reply.code(404).send({ error: 'Subscription not found' });
    }

    const currentPeriod = new Date().toISOString().slice(0, 7);
    const periodUsage = subscription.usage.filter(
      (u: { billingPeriod: string }) => u.billingPeriod === currentPeriod
    );

    const usageSummary = {
      deployments: periodUsage
        .filter((u: { metric: string }) => u.metric === 'DEPLOYMENTS')
        .reduce((sum: number, u: { quantity: number }) => sum + u.quantity, 0),
      buildMinutes: periodUsage
        .filter((u: { metric: string }) => u.metric === 'BUILD_MINUTES')
        .reduce((sum: number, u: { quantity: number }) => sum + u.quantity, 0),
      storageGB: periodUsage
        .filter((u: { metric: string }) => u.metric === 'STORAGE_GB')
        .reduce((sum: number, u: { quantity: number }) => sum + u.quantity, 0),
      bandwidthGB: periodUsage
        .filter((u: { metric: string }) => u.metric === 'BANDWIDTH_GB')
        .reduce((sum: number, u: { quantity: number }) => sum + u.quantity, 0),
    };

    const limits = PLAN_LIMITS[subscription.plan as keyof typeof PLAN_LIMITS];


    return {
      plan: subscription.plan,
      usage: usageSummary,
      limits,
      exceeded: {
        deployments: usageSummary.deployments >= limits.deploymentsPerMonth,
        buildMinutes: usageSummary.buildMinutes >= limits.buildMinutesPerMonth,
        storageGB: usageSummary.storageGB >= limits.storageGB,
        bandwidthGB: usageSummary.bandwidthGB >= limits.bandwidthGB,
      },
    };
  });
};

// Webhook handlers
async function handleSubscriptionCreated(data: any) {
  const { organizationId, plan } = data.metadata;

  await prisma.subscription.upsert({
    where: { organizationId },
    update: {
      polarSubscriptionId: data.id,
      polarCustomerId: data.customerId,
      plan,
      status: 'ACTIVE',
      currentPeriodStart: new Date(data.currentPeriodStart),
      currentPeriodEnd: new Date(data.currentPeriodEnd),
    },
    create: {
      organizationId,
      polarSubscriptionId: data.id,
      polarCustomerId: data.customerId,
      plan,
      status: 'ACTIVE',
      currentPeriodStart: new Date(data.currentPeriodStart),
      currentPeriodEnd: new Date(data.currentPeriodEnd),
    },
  });
}

async function handleSubscriptionUpdated(data: any) {
  await prisma.subscription.update({
    where: { polarSubscriptionId: data.id },
    data: {
      status: data.status,
      currentPeriodStart: new Date(data.currentPeriodStart),
      currentPeriodEnd: new Date(data.currentPeriodEnd),
      cancelAtPeriodEnd: data.cancelAtPeriodEnd,
    },
  });
}

async function handleSubscriptionCanceled(data: any) {
  await prisma.subscription.update({
    where: { polarSubscriptionId: data.id },
    data: {
      status: 'CANCELED',
      cancelAtPeriodEnd: true,
    },
  });
}

async function handlePaymentSucceeded(data: any) {
  // Log successful payment
  console.log('Payment succeeded:', data);
}

export default billingRoutes;
