"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Rocket } from "lucide-react";

interface ProjectDetailsStepProps {
  projectName: string;
  repositoryName: string;
  onChange: (name: string) => void;
  onBack: () => void;
  onCreate: () => void;
  isCreating: boolean;
}

export function ProjectDetailsStep({
  projectName,
  repositoryName,
  onChange,
  onBack,
  onCreate,
  isCreating,
}: ProjectDetailsStepProps) {
  // Auto-suggest project name from repository
  React.useEffect(() => {
    if (!projectName && repositoryName) {
      const suggestedName =
        repositoryName.split("/").pop()?.toLowerCase() || "";
      onChange(suggestedName);
    }
  }, [repositoryName]);

  const canCreate = projectName.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Project Details</h3>
        <p className="text-sm text-muted-foreground">
          Give your project a name to identify it easily
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="projectName">Project Name</Label>
          <Input
            id="projectName"
            placeholder="my-awesome-app"
            value={projectName}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            This will be used to identify your project in the dashboard
          </p>
        </div>

        {/* Summary */}
        <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-3">
          <p className="text-sm font-medium">Project Summary</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{projectName || "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Repository:</span>
              <span className="font-mono text-xs">{repositoryName}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="ghost" onClick={onBack} disabled={isCreating}>
          Back
        </Button>
        <Button onClick={onCreate} disabled={!canCreate || isCreating}>
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating Project...
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4 mr-2" />
              Create Project
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
