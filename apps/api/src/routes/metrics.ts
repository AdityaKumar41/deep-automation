import { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth";
import { prisma } from "@evolvx/db";
import { z } from "zod";

const GetMetricsSchema = z.object({
  window: z.string().optional().default("1h"), // 15m, 1h, 6h, 24h, 7d
  type: z
    .enum(["CPU", "MEMORY", "NETWORK_RX", "NETWORK_TX", "DISK"])
    .optional(),
});

export default async function metricsRoutes(fastify: FastifyInstance) {
  // Get metrics for a specific deployment
  fastify.get<{
    Params: { deploymentId: string };
    Querystring: { window?: string; type?: string };
  }>(
    "/deployments/:deploymentId/metrics",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { deploymentId } = request.params;
      const { window = "1h", type } = GetMetricsSchema.parse(request.query);

      // Calculate time range
      const now = new Date();
      const windowMs = parseWindow(window);
      const startTime = new Date(now.getTime() - windowMs);

      // Fetch deployment to verify access
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: {
          project: {
            include: {
              organization: {
                include: {
                  members: {
                    where: { userId: request.auth!.userId },
                  },
                },
              },
            },
          },
        },
      });

      if (!deployment || deployment.project.organization.members.length === 0) {
        return reply.code(404).send({ error: "Deployment not found" });
      }

      // Build query
      const where: any = {
        deploymentId,
        timestamp: {
          gte: startTime,
        },
      };

      if (type) {
        where.type = type;
      }

      // Fetch metrics
      const metrics = await prisma.metric.findMany({
        where,
        orderBy: { timestamp: "asc" },
      });

      // Aggregate metrics by type
      const aggregated = aggregateMetrics(metrics, window);

      return {
        deploymentId,
        project: deployment.project.name,
        window,
        startTime,
        endTime: now,
        metrics: aggregated,
        raw: metrics.length,
      };
    }
  );

  // Get metrics for a project (all deployments)
  fastify.get<{
    Params: { projectId: string };
    Querystring: { window?: string; type?: string };
  }>(
    "/projects/:projectId/metrics",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { projectId } = request.params;
      const { window = "1h", type } = GetMetricsSchema.parse(request.query);

      const now = new Date();
      const windowMs = parseWindow(window);
      const startTime = new Date(now.getTime() - windowMs);

      // Verify access
      const project = await prisma.project.findUnique({
        where: { id: projectId },
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
        return reply.code(404).send({ error: "Project not found" });
      }

      // Get all deployments for this project
      const deployments = await prisma.deployment.findMany({
        where: { projectId },
        select: { id: true },
      });

      const deploymentIds = deployments.map((d: any) => d.id);

      // Fetch metrics
      const where: any = {
        deploymentId: { in: deploymentIds },
        timestamp: { gte: startTime },
      };

      if (type) {
        where.type = type;
      }

      const metrics = await prisma.metric.findMany({
        where,
        orderBy: { timestamp: "asc" },
      });

      const aggregated = aggregateMetrics(metrics, window);

      return {
        projectId,
        projectName: project.name,
        window,
        startTime,
        endTime: now,
        deployments: deploymentIds.length,
        metrics: aggregated,
      };
    }
  );

  // Get latest metrics for a deployment (for AI queries)
  fastify.get<{
    Params: { deploymentId: string };
  }>(
    "/deployments/:deploymentId/metrics/latest",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { deploymentId } = request.params;

      // Verify access
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: {
          project: {
            include: {
              organization: {
                include: {
                  members: {
                    where: { userId: request.auth!.userId },
                  },
                },
              },
            },
          },
        },
      });

      if (!deployment || deployment.project.organization.members.length === 0) {
        return reply.code(404).send({ error: "Deployment not found" });
      }

      // Get latest metrics of each type (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const latestMetrics = await prisma.metric.findMany({
        where: {
          deploymentId,
          timestamp: { gte: fiveMinutesAgo },
        },
        orderBy: { timestamp: "desc" },
        take: 50,
      });

      // Group by type and get latest
      const byType: Record<string, any> = {};
      for (const metric of latestMetrics) {
        if (!byType[metric.type]) {
          byType[metric.type] = metric;
        }
      }

      return {
        deploymentId,
        lastUpdated: latestMetrics[0]?.timestamp || null,
        current: byType,
        status: deployment.status,
      };
    }
  );
}

/**
 * Parse window string to milliseconds
 */
function parseWindow(window: string): number {
  const match = window.match(/^(\d+)([mhd])$/);
  if (!match) return 60 * 60 * 1000; // Default 1h

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
}

/**
 * Aggregate metrics by time buckets
 */
function aggregateMetrics(metrics: any[], window: string) {
  if (metrics.length === 0) return {};

  // Determine bucket size based on window
  const windowMs = parseWindow(window);
  let bucketSize: number;

  if (windowMs <= 15 * 60 * 1000) {
    // 15m -> 1min buckets
    bucketSize = 60 * 1000;
  } else if (windowMs <= 60 * 60 * 1000) {
    // 1h -> 5min buckets
    bucketSize = 5 * 60 * 1000;
  } else if (windowMs <= 6 * 60 * 60 * 1000) {
    // 6h -> 15min buckets
    bucketSize = 15 * 60 * 1000;
  } else {
    // 24h+ -> 1h buckets
    bucketSize = 60 * 60 * 1000;
  }

  // Group metrics by type
  const byType: Record<string, any[]> = {};
  for (const metric of metrics) {
    if (!byType[metric.type]) {
      byType[metric.type] = [];
    }
    byType[metric.type].push(metric);
  }

  // Aggregate each type
  const result: Record<string, any> = {};

  for (const [type, typeMetrics] of Object.entries(byType)) {
    const buckets: Record<
      number,
      { sum: number; count: number; max: number; min: number }
    > = {};

    for (const metric of typeMetrics) {
      const timestamp = new Date(metric.timestamp).getTime();
      const bucketKey = Math.floor(timestamp / bucketSize) * bucketSize;

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          sum: 0,
          count: 0,
          max: -Infinity,
          min: Infinity,
        };
      }

      const value = parseFloat(metric.value);
      buckets[bucketKey].sum += value;
      buckets[bucketKey].count += 1;
      buckets[bucketKey].max = Math.max(buckets[bucketKey].max, value);
      buckets[bucketKey].min = Math.min(buckets[bucketKey].min, value);
    }

    // Convert to array format
    const dataPoints = Object.entries(buckets).map(([timestamp, stats]) => ({
      timestamp: new Date(parseInt(timestamp)),
      avg: stats.sum / stats.count,
      max: stats.max,
      min: stats.min,
      unit: getUnit(type),
    }));

    dataPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    result[type] = {
      data: dataPoints,
      summary: {
        avg:
          dataPoints.reduce((sum, p) => sum + p.avg, 0) / dataPoints.length ||
          0,
        max: Math.max(...dataPoints.map((p) => p.max)),
        min: Math.min(...dataPoints.map((p) => p.min)),
        latest: dataPoints[dataPoints.length - 1]?.avg || 0,
      },
    };
  }

  return result;
}

/**
 * Get unit for metric type
 */
function getUnit(type: string): string {
  switch (type) {
    case "CPU":
    case "MEMORY":
    case "DISK":
      return "percent";
    case "NETWORK_RX":
    case "NETWORK_TX":
      return "bytes";
    default:
      return "value";
  }
}
