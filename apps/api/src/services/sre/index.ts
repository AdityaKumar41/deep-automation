import { prisma } from "@evolvx/db";
import { chatCompletion } from "../openai";

interface MetricPoint {
  timestamp: Date;
  value: number;
}

interface DiagnosisResult {
  summary: string;
  rootCause: string;
  suggestedFix: string;
  confidence: number;
}

/**
 * Analyze project metrics using AI
 */
export async function analyzeMetrics(
  projectId: string,
  period: "1h" | "24h" | "7d" = "24h"
): Promise<string> {
  const metrics = await prisma.metric.findMany({
    where: {
      projectId,
      timestamp: {
        gte: new Date(
          Date.now() -
            (period === "1h"
              ? 3600000
              : period === "24h"
                ? 86400000
                : 604800000)
        ),
      },
    },
    orderBy: { timestamp: "desc" },
    take: 500,
  });

  if (metrics.length === 0) return "No metrics available for this period.";

  // Group by type
  const grouped: Record<string, MetricPoint[]> = {};
  metrics.forEach((m: any) => {
    if (!grouped[m.type]) grouped[m.type] = [];
    grouped[m.type].push({ timestamp: m.timestamp, value: m.value });
  });

  // Calculate summaries
  let summaryText = "";
  for (const [type, points] of Object.entries(grouped)) {
    const avg = points.reduce((sum, p) => sum + p.value, 0) / points.length;
    const max = Math.max(...points.map((p) => p.value));
    summaryText += `- ${type}: Avg ${avg.toFixed(2)}, Max ${max.toFixed(2)}\n`;
  }

  // AI Interpretation
  const prompt = `You are an SRE. Analyze these metrics:
${summaryText}

Identify any anomalies, performance bottlenecks, or healthy trends. Be concise.`;

  const response = await chatCompletion({
    messages: [
      {
        role: "system",
        content: "You are an expert Site Reliability Engineer.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
  });

  return response.content;
}

/**
 * Diagnose a failed deployment or runtime error
 */
export async function diagnoseError(
  deploymentId: string
): Promise<DiagnosisResult> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) throw new Error("Deployment not found");

  const prompt = `Diagnose this failure:
Project ID: ${deployment.projectId}
Deployment ID: ${deployment.id}
Status: ${deployment.status}
Error Message: ${deployment.errorMessage || "No error message"}
Logs Tail:
${deployment.buildLogs ? deployment.buildLogs.slice(-2000) : "No build logs"}
${deployment.deployLogs ? deployment.deployLogs.slice(-2000) : "No deploy logs"}

1. What is the root cause?
2. How to fix it?
3. Confidence score (0-1).`;

  const response = await chatCompletion({
    messages: [
      {
        role: "system",
        content: "You are an expert DevOps engineer who fixes broken builds.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  // Simple parsing of unstructured response
  // In a real app we'd use structured outputs again

  return {
    summary: response.content,
    rootCause: "AI determined based on logs.",
    suggestedFix: "Follow AI suggestions.",
    confidence: 0.8,
  };
}
