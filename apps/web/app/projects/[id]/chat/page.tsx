"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api";
import { ChatWindow } from "@/components/chat/chat-window";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Settings,
  Rocket,
  Activity,
  Key,
  Github,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function ProjectChatPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApiClient();
  const projectId = params.id as string;

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await api.get(`/api/projects/${projectId}`);
      return res.data.project;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-7xl mx-auto space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-[calc(100vh-200px)] w-full" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <p className="text-muted-foreground mb-4">
            The project you're looking for doesn't exist
          </p>
          <Link href="/dashboard">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{project.name}</h1>
                <Badge
                  variant={
                    project.status === "CONFIGURED" ? "default" : "secondary"
                  }
                >
                  {project.status}
                </Badge>
              </div>
              {project.repoUrl && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <Github className="w-3 h-3" />
                  <span>
                    {project.repoUrl.replace("https://github.com/", "")}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/projects/${projectId}/deployments`}>
              <Button variant="outline" size="sm">
                <Rocket className="w-4 h-4 mr-2" />
                Deployments
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/monitoring`}>
              <Button variant="outline" size="sm">
                <Activity className="w-4 h-4 mr-2" />
                Monitoring
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/secrets`}>
              <Button variant="outline" size="sm">
                <Key className="w-4 h-4 mr-2" />
                Secrets
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/settings`}>
              <Button variant="ghost" size="icon">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Chat Interface */}
      <div className="flex-1 overflow-hidden">
        <ChatWindow projectId={projectId} />
      </div>
    </div>
  );
}
