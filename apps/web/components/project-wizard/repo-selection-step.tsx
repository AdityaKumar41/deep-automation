"use client";

import * as React from "react";
import { useApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Github,
  Server,
  Loader2,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface RepoSelectionStepProps {
  value: string;
  repositoryName: string;
  hasGitHubApp: boolean;
  deploymentType: "TRIVX_RUNNER" | "GITHUB_ACTIONS";
  onChange: (
    data: Partial<{
      repositoryUrl: string;
      repositoryName: string;
      hasGitHubApp: boolean;
      deploymentType: "TRIVX_RUNNER" | "GITHUB_ACTIONS";
    }>
  ) => void;
  onNext: () => void;
}

export function RepoSelectionStep({
  value,
  repositoryName,
  hasGitHubApp,
  deploymentType,
  onChange,
  onNext,
}: RepoSelectionStepProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [repositories, setRepositories] = React.useState<
    Array<{ id: string; fullName: string; url: string }>
  >([]);
  const [needsInstallation, setNeedsInstallation] = React.useState(false);
  const api = useApiClient();

  React.useEffect(() => {
    fetchRepositories();
  }, []);

  const fetchRepositories = async () => {
    try {
      setIsLoading(true);
      const response = await api.get("/api/github/repositories");

      if (response.data.needsInstallation) {
        setNeedsInstallation(true);
        onChange({ hasGitHubApp: false });
      } else {
        setRepositories(response.data.repositories || []);
        onChange({ hasGitHubApp: true });
      }
    } catch (error: any) {
      console.error("Failed to fetch repositories:", error);
      if (
        error.response?.status === 404 ||
        error.response?.data?.needsInstallation
      ) {
        setNeedsInstallation(true);
        onChange({ hasGitHubApp: false });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstallGitHubApp = () => {
    const githubAppName =
      process.env.NEXT_PUBLIC_GITHUB_APP_NAME || "evolvx-ai-deployer";
    window.open(
      `https://github.com/apps/${githubAppName}/installations/new`,
      "_blank"
    );
  };

  const handleRepoSelect = (repoFullName: string) => {
    const repo = repositories.find((r) => r.fullName === repoFullName);
    if (repo) {
      onChange({
        repositoryUrl: repo.url,
        repositoryName: repoFullName,
      });
    }
  };

  const canProceed = value && repositoryName;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Select Repository</h3>
        <p className="text-sm text-muted-foreground">
          Choose a GitHub repository to deploy with Evolvx AI
        </p>
      </div>

      {/* Deployment Type */}
      <div className="space-y-2">
        <Label>Deployment Engine</Label>
        <Tabs
          value={deploymentType}
          onValueChange={(v) => onChange({ deploymentType: v as any })}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="TRIVX_RUNNER"
              className="flex items-center gap-2"
            >
              <Server className="w-4 h-4" />
              Evolvx Runner
            </TabsTrigger>
            <TabsTrigger
              value="GITHUB_ACTIONS"
              className="flex items-center gap-2"
            >
              <Github className="w-4 h-4" />
              GitHub Actions
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="TRIVX_RUNNER"
            className="text-sm text-muted-foreground mt-2"
          >
            Use our optimized micro-VM runners for maximum speed and AI-driven
            debugging.
          </TabsContent>
          <TabsContent
            value="GITHUB_ACTIONS"
            className="text-sm text-muted-foreground mt-2"
          >
            Generate and commit workflows to your repository. Requires GitHub
            App installation.
          </TabsContent>
        </Tabs>
      </div>

      {/* GitHub App Installation */}
      {needsInstallation ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              Install the Evolvx AI GitHub App to access your repositories
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleInstallGitHubApp}
              className="ml-4"
            >
              <Github className="w-4 h-4 mr-2" />
              Install GitHub App
              <ExternalLink className="w-3 h-3 ml-2" />
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : repositories.length > 0 ? (
        <div className="space-y-2">
          <Label htmlFor="repository">Select Repository</Label>
          <Select value={repositoryName} onValueChange={handleRepoSelect}>
            <SelectTrigger id="repository">
              <SelectValue placeholder="Choose a repository..." />
            </SelectTrigger>
            <SelectContent>
              {repositories.map((repo) => (
                <SelectItem key={repo.id} value={repo.fullName}>
                  <div className="flex items-center gap-2">
                    <Github className="w-4 h-4" />
                    {repo.fullName}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Can't find your repository?{" "}
            <button
              type="button"
              onClick={handleInstallGitHubApp}
              className="text-primary hover:underline"
            >
              Grant access
            </button>
          </p>
        </div>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No repositories found. Please install the GitHub App or grant access
            to your repositories.
          </AlertDescription>
        </Alert>
      )}

      {value && (
        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <p className="text-sm font-medium mb-1">Selected Repository</p>
          <p className="text-sm text-muted-foreground font-mono">
            {repositoryName}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!canProceed}>
          Continue
        </Button>
      </div>
    </div>
  );
}
