"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  GitBranch,
  ExternalLink,
  Settings,
  Trash2,
  Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ProjectsPage() {
  const api = useApi();
  const router = useRouter();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const orgs = await api.getOrganizations();
      if (orgs.length > 0) {
        return api.getProjects(orgs[0].id);
      }
      return [];
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "READY":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "ANALYZING":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "ERROR":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Manage your deployment projects
          </p>
        </div>

        <Button onClick={() => router.push("/onboarding/project")}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="hover:shadow-lg transition-shadow"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/project/${project.id}`}
                        className="hover:underline"
                      >
                        {project.name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <GitBranch className="h-3 w-3" />
                      {project.branch}
                    </CardDescription>
                  </div>

                  <Badge
                    variant="outline"
                    className={getStatusColor(project.status)}
                  >
                    {project.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  {project.framework && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Framework:</span>
                      <Badge variant="secondary">{project.framework}</Badge>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-medium">
                      {project.deploymentType === "TRIVX_RUNNER"
                        ? "Evolvx Runner"
                        : "GitHub Actions"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span>
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    asChild
                  >
                    <Link href={`/dashboard/project/${project.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View
                    </Link>
                  </Button>

                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/project/${project.id}/settings`}>
                      <Settings className="h-4 w-4" />
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
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
              Create your first project to start deploying with AI-powered
              automation
            </p>
            <Button onClick={() => router.push("/onboarding/project")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
