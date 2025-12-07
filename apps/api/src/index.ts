import dotenv from "dotenv";
import path from "path";

// Load environment variables from multiple locations
dotenv.config(); // Load from current directory (.env)
// dotenv.config({ path: path.resolve(__dirname, "../.env") }); // Load from apps/api/.env
// dotenv.config({ path: path.resolve(__dirname, "../../../.env") }); // Load from root .env

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import { clerkPlugin } from "@clerk/fastify";
import { prisma } from "@evolvx/db";

// Import routes
import organizationRoutes from "./routes/organizations";
import projectRoutes from "./routes/projects";
import deploymentRoutes from "./routes/deployments";
import githubRoutes from "./routes/github";
import billingRoutes from "./routes/billing";
import chatRoutes from "./routes/chat";
import metricsRoutes from "./routes/metrics";
import webhookRoutes from "./routes/webhooks";

const fastify = Fastify({
  logger: true,
});

// Register plugins
async function registerPlugins() {
  await fastify.register(helmet);
  await fastify.register(cors, {
    origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    credentials: true,
  });

  // Register Clerk authentication

  await fastify.register(clerkPlugin, {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
    secretKey: process.env.CLERK_SECRET_KEY!,
  });

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || "supersecret",
  });
}

// Register routes
async function registerRoutes() {
  // Register webhooks first (no auth needed)
  await fastify.register(webhookRoutes, { prefix: "/api" });

  await fastify.register(organizationRoutes, { prefix: "/api/organizations" });
  await fastify.register(projectRoutes, { prefix: "/api/projects" });
  await fastify.register(deploymentRoutes, { prefix: "/api/deployments" });
  await fastify.register(githubRoutes, { prefix: "/api/github" });
  await fastify.register(billingRoutes, { prefix: "/api/billing" });
  await fastify.register(chatRoutes, { prefix: "/api/chat" });
  await fastify.register(import("./routes/metrics"), {
    prefix: "/api/metrics",
  });
  await fastify.register(import("./routes/ai"), { prefix: "/api/ai" });
  const { default: mcpRoutes } = await import("./routes/mcp");
  fastify.register(mcpRoutes, { prefix: "/api" });
}

// Health check
fastify.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Start server
async function start() {
  try {
    await registerPlugins();
    await registerRoutes();

    // Initialize Qdrant collections
    const { initializeCollections } = await import("./services/qdrant");
    await initializeCollections();
    fastify.log.info("Qdrant collections initialized");

    // Register Inngest endpoint
    const { inngestHandler } = await import("./inngest/serve");
    fastify.all("/api/inngest", async (req: any, reply: any) => {
      return await inngestHandler(req, reply);
    });
    fastify.log.info("Inngest endpoint registered at /api/inngest");

    // Initialize Kafka topics
    const { createTopics } = await import("@evolvx/queue");
    await createTopics();
    fastify.log.info("Kafka topics initialized");

    const port = parseInt(process.env.PORT || "3001", 10);
    const host = process.env.HOST || "0.0.0.0";

    await fastify.listen({ port, host });

    console.log(`🚀 API Server running on http://${host}:${port}`);
    console.log(`✅ Clerk authentication enabled`);
    console.log(`✅ Qdrant vector database ready`);
    console.log(`✅ Kafka event bus ready`);
    console.log(`✅ Inngest workflows registered`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
});

start();
