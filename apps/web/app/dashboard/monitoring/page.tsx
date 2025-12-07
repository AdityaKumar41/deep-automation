"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricsDashboard } from "@/components/monitoring/metrics-dashboard";
import { useSearchParams } from "next/navigation";

export default function MonitoringPage() {
  const searchParams = useSearchParams();
  const deploymentId = searchParams.get("deploymentId") || "";

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Monitoring</h1>
        <p className="text-muted-foreground">
          Real-time metrics and performance monitoring
        </p>
      </div>

      {deploymentId ? (
        <MetricsDashboard deploymentId={deploymentId} />
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          Please select a deployment to view metrics
        </div>
      )}
    </div>
  );
}
