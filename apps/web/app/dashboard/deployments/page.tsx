"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
} from "lucide-react";
import Link from "next/link";

export default function DeploymentsPage() {
  const api = useApiClient();

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api.get("/api/projects");
      return res.data.projects || [];
    },
  });

  const { data: deployments, isLoading: deploymentsLoading } = useQuery({
    queryKey: ["all-deployments", projects],
    enabled: !!projects && projects.length > 0,
    queryFn: async () => {
      if (!projects || projects.length === 0) return [];

      const allDeployments = await Promise.all(
        projects.map(async (p: any) => {
          const res = await api.get(`/api/deployments?projectId=${p.id}`);
          return res.data.deployments || [];
        })
      );
      return allDeployments
        .flat()
        .sort(
          (a: any, b: any) =>
            new Date(b.startedAt || b.createdAt).getTime() -
            new Date(a.startedAt || a.createdAt).getTime()
        );
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "FAILED":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "BUILDING":
      case "DEPLOYING":
        return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "FAILED":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "BUILDING":
      case "DEPLOYING":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Deployments</h1>
          <p className="text-muted-foreground">
            View and manage all your deployments
          </p>
        </div>

        <Button>
          <Play className="mr-2 h-4 w-4" />
          New Deployment
        </Button>
      </div>

      {deploymentsLoading || projectsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : deployments && deployments.length > 0 ? (
        <div className="space-y-4">
          {deployments.map((deployment) => (
            <Card
              key={deployment.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    {getStatusIcon(deployment.status)}

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/deployment/${deployment.id}`}
                          className="text-lg font-semibold hover:underline"
                        >
                          {deployment.commitMessage}
                        </Link>
                        <Badge
                          variant="outline"
                          className={getStatusColor(deployment.status)}
                        >
                          {deployment.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Branch: {deployment.branch}</span>
                        <span>•</span>
                        <span>
                          Commit: {deployment.commitSha.substring(0, 7)}
                        </span>
                        <span>•</span>
                        <span>
                          {new Date(deployment.startedAt).toLocaleString()}
                        </span>
                      </div>

                      {deployment.completedAt && (
                        <div className="text-sm text-muted-foreground">
                          Duration:{" "}
                          {Math.round(
                            (new Date(deployment.completedAt).getTime() -
                              new Date(deployment.startedAt).getTime()) /
                              1000
                          )}
                          s
                        </div>
                      )}
                    </div>
                  </div>

                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/deployment/${deployment.id}`}>
                      View Details
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Rocket className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No deployments yet</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
              Create a project and trigger your first deployment
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
