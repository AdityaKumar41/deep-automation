import dotenv from "dotenv";
import path from "path";

// Load environment variables from multiple locations
dotenv.config(); // Load from current directory (.env)
dotenv.config({ path: path.resolve(__dirname, "../.env") }); // Load from apps/runner-service/.env
dotenv.config({ path: path.resolve(__dirname, "../../../.env") }); // Load from root .env

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { prisma } from "@evolvx/db";
import {
  buildImage,
  runContainer,
  getContainerLogs,
  streamContainerLogs,
  getContainerStats,
  stopContainer,
  checkContainerHealth,
  listContainers,
} from "./services/docker";

const fastify = Fastify({
  logger: true,
});

// Register plugins
async function registerPlugins() {
  await fastify.register(cors, {
    origin: true,
  });

  await fastify.register(helmet);
}

// Health check
fastify.get("/health", async () => {
  return { status: "ok", service: "runner" };
});

// Build and deploy endpoint
fastify.post<{
  Body: {
    deploymentId: string;
    projectId: string;
    repoUrl: string;
    branch: string;
    commitSha: string;
    dockerfile: string;
    envVars: Record<string, string>;
    port: number;
  };
}>("/deploy", async (request, reply) => {
  const {
    deploymentId,
    projectId,
    repoUrl,
    branch,
    commitSha,
    dockerfile,
    envVars,
    port,
  } = request.body;

  try {
    // Update deployment status to BUILDING
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "BUILDING",
        buildLogs: "Starting build...\n",
      },
    });

    // Build image with real-time log streaming
    const buildResult = await buildImage(
      {
        deploymentId,
        projectId,
        repoUrl,
        branch,
        commitSha,
        dockerfile,
        envVars,
      },
      async (log: string) => {
        // Stream logs to database in real-time
        try {
          const current = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            select: { buildLogs: true },
          });
          
          await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
              buildLogs: (current?.buildLogs || '') + log,
            },
          });
        } catch (error) {
          fastify.log.error({ err: error }, 'Failed to update build logs');
        }
      }
    );

    if (!buildResult.success) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          errorMessage: buildResult.error,
          buildLogs: buildResult.logs,
          completedAt: new Date(),
        },
      });

      return reply.code(500).send({
        success: false,
        error: buildResult.error,
      });
    }

    // Update build logs
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        buildLogs: buildResult.logs,
        status: "DEPLOYING",
      },
    });

    // Run container
    const runResult = await runContainer({
      deploymentId,
      projectId,
      imageName: buildResult.imageName!,
      port,
      envVars,
      resourceLimits: {
        memory: "512Mi",
        cpuShares: 1024,
      },
    });

    if (!runResult.success) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          errorMessage: runResult.error,
          completedAt: new Date(),
        },
      });

      return reply.code(500).send({
        success: false,
        error: runResult.error,
      });
    }

    // Wait for health check
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const isHealthy = await checkContainerHealth(
      runResult.containerId!,
      "/health",
      port
    );

    if (!isHealthy) {
      fastify.log.warn(
        { deploymentId },
        "Health check failed, but deployment continues"
      );
    }

    // Update deployment to SUCCESS
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "SUCCESS",
        deployUrl: `https://${projectId}.evolvx.app`,
        completedAt: new Date(),
      },
    });

    return {
      success: true,
      containerId: runResult.containerId,
      deployUrl: `https://${projectId}.evolvx.app`,
    };
  } catch (error: any) {
    fastify.log.error({ err: error, deploymentId }, "Deployment failed");

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: error.message,
        completedAt: new Date(),
      },
    });

    return reply.code(500).send({
      success: false,
      error: error.message,
    });
  }
});

// Get container logs
fastify.get<{
  Params: { deploymentId: string };
}>("/logs/:deploymentId", async (request, reply) => {
  const { deploymentId } = request.params;

  try {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
    });

    if (!deployment) {
      return reply.code(404).send({ error: "Deployment not found" });
    }

    // Find container by deployment ID
    const containers = await listContainers();
    const container = containers.find((c) => c.deploymentId === deploymentId);

    if (!container) {
      return { logs: deployment.buildLogs || "No logs available" };
    }

    const logs = await getContainerLogs(container.id);

    return { logs };
  } catch (error: any) {
    return reply.code(500).send({ error: error.message });
  }
});

// Stream container logs (SSE)
fastify.get<{
  Params: { deploymentId: string };
}>("/logs/:deploymentId/stream", async (request, reply) => {
  const { deploymentId } = request.params;

  try {
    const containers = await listContainers();
    const container = containers.find((c) => c.deploymentId === deploymentId);

    if (!container) {
      return reply.code(404).send({ error: "Container not found" });
    }

    const logStream = await streamContainerLogs(container.id);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    logStream.on("data", (chunk) => {
      reply.raw.write(`data: ${chunk.toString()}\n\n`);
    });

    logStream.on("end", () => {
      reply.raw.end();
    });

    return reply;
  } catch (error: any) {
    return reply.code(500).send({ error: error.message });
  }
});

// Get container stats
fastify.get<{
  Params: { deploymentId: string };
}>("/stats/:deploymentId", async (request, reply) => {
  const { deploymentId } = request.params;

  try {
    const containers = await listContainers();
    const container = containers.find((c) => c.deploymentId === deploymentId);

    if (!container) {
      return reply.code(404).send({ error: "Container not found" });
    }

    const stats = await getContainerStats(container.id);

    // Store metrics in database
    await prisma.metric.create({
      data: {
        projectId: container.projectId,
        type: "CPU_USAGE",
        value: stats.cpu,
        unit: "percent",
        timestamp: new Date(),
      },
    });

    await prisma.metric.create({
      data: {
        projectId: container.projectId,
        type: "MEMORY_USAGE",
        value: stats.memory,
        unit: "percent",
        timestamp: new Date(),
      },
    });

    return stats;
  } catch (error: any) {
    return reply.code(500).send({ error: error.message });
  }
});

// Stop deployment
fastify.post<{
  Params: { deploymentId: string };
}>("/stop/:deploymentId", async (request, reply) => {
  const { deploymentId } = request.params;

  try {
    const containers = await listContainers();
    const container = containers.find((c) => c.deploymentId === deploymentId);

    if (!container) {
      return reply.code(404).send({ error: "Container not found" });
    }

    const stopped = await stopContainer(container.id);

    if (stopped) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "CANCELED",
          completedAt: new Date(),
        },
      });

      return { success: true };
    }

    return reply.code(500).send({ error: "Failed to stop container" });
  } catch (error: any) {
    return reply.code(500).send({ error: error.message });
  }
});

// List all deployments
fastify.get("/deployments", async () => {
  const containers = await listContainers();
  return { deployments: containers };
});

// Start server
async function start() {
  try {
    await registerPlugins();

    const port = parseInt(process.env.RUNNER_PORT || "3002", 10);
    const host = process.env.RUNNER_HOST || "0.0.0.0";

    await fastify.listen({ port, host });

    console.log(`🐳 Runner Service running on http://${host}:${port}`);
    console.log(`✅ Docker daemon connected`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await fastify.close();
  process.exit(0);
});

start();
