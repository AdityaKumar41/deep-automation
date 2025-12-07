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
import { Github, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";

export default function GitHubIntegrationPage() {
  const api = useApi();

  const { data: repositories, isLoading } = useQuery({
    queryKey: ["github-repositories"],
    queryFn: () => api.getGitHubRepositories(),
  });

  const handleInstallGitHubApp = () => {
    // Redirect to GitHub App installation
    const appName =
      process.env.NEXT_PUBLIC_GITHUB_APP_NAME || "evolvx-ai-deployer";
    window.location.href = `https://github.com/apps/${appName}/installations/new`;
  };

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">GitHub Integration</h1>
        <p className="text-muted-foreground">
          Connect your GitHub repositories to Evolvx AI
        </p>
      </div>

      {/* Installation Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            <CardTitle>GitHub App</CardTitle>
          </div>
          <CardDescription>
            Install the Evolvx AI GitHub App to enable repository access and
            webhooks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-1 space-y-2">
              <h3 className="font-medium">Features</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Automatic deployments on push
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Pull request previews
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Commit status checks
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Repository analysis
                </li>
              </ul>
            </div>

            <Button onClick={handleInstallGitHubApp}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Install GitHub App
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Connected Repositories */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Repositories</CardTitle>
          <CardDescription>
            Repositories accessible by the Evolvx AI GitHub App
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading repositories...
            </p>
          ) : repositories && repositories.length > 0 ? (
            <div className="space-y-3">
              {repositories.map((repo: any) => (
                <div
                  key={repo.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Github className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{repo.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {repo.private ? "Private" : "Public"} •{" "}
                        {repo.defaultBranch}
                      </p>
                    </div>
                  </div>

                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No repositories connected yet. Install the GitHub App to get
                started.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhooks Status */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Events</CardTitle>
          <CardDescription>
            Events that trigger actions in Evolvx AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Push Events</span>
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-500 border-green-500/20"
              >
                Active
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Pull Request Events</span>
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-500 border-green-500/20"
              >
                Active
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Workflow Events</span>
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-500 border-green-500/20"
              >
                Active
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Release Events</span>
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-500 border-green-500/20"
              >
                Active
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
