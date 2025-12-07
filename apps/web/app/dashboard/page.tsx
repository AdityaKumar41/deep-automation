"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Box, Github, Clock, Loader2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@clerk/nextjs";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const { user } = useUser();
  const api = useApiClient();
  const router = useRouter();

  // Check if user has organization
  const {
    data: orgs,
    isLoading: orgsLoading,
    isError,
  } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const res = await api.get("/api/organizations");
      return res.data.organizations || [];
    },
    staleTime: 5000, // Consider data fresh for 5 seconds
  });

  // Don't redirect here - OnboardingGuard in layout handles redirects
  // This prevents conflicts and infinite redirect loops

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api.get("/api/projects");
      return res.data.projects || [];
    },
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Click a project to open its AI Chat Assistant
          </p>
        </div>
        <Link href="/dashboard/new">
          <Button className="gap-2 shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 transition-all">
            <Plus className="w-4 h-4" /> New Project
          </Button>
        </Link>
      </div>
      {/* Projects Grid - Vercel Style */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Recent Projects</h3>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : projects?.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project: any) => (
              <Link href={`/dashboard/project/${project.id}`} key={project.id}>
                <Card className="h-full hover:border-primary/50 hover:shadow-md transition-all group">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {project.name}
                      <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0" />
                    </CardTitle>
                    <CardDescription className="line-clamp-1">
                      {project.description || "No description"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div
                        className={`w-2 h-2 rounded-full ${project.status === "ACTIVE" ? "bg-emerald-500" : "bg-yellow-500"}`}
                      />
                      {project.deploymentType || "Unknown"}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-lg bg-card/30">
            <Box className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No projects found</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2 mb-6">
              Get started by creating your first project. We&apos;ll help you
              deploy it in minutes.
            </p>
            <Link href="/dashboard/new">
              <Button>Create Project</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
