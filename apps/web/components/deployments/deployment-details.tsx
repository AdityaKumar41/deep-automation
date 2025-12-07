"use client";

import { useEffect, useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play,
  Square,
  RefreshCw,
  ExternalLink,
  Clock,
  GitCommit,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
} from "lucide-react";
import { Deployment } from "@/lib/types";

interface DeploymentDetailsProps {
  deployment: Deployment;
}

export function DeploymentDetails({ deployment }: DeploymentDetailsProps) {
  const [logs, setLogs] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Scroll to bottom when new logs arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    // Stream logs if deployment is in progress
    if (deployment.status === "BUILDING" || deployment.status === "DEPLOYING") {
      startLogStream();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [deployment.id, deployment.status]);

  const startLogStream = () => {
    const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const eventSource = new EventSource(
      `${baseURL}/api/deployments/${deployment.id}/logs/stream`
    );

    eventSourceRef.current = eventSource;
    setStreaming(true);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.done) {
        eventSource.close();
        setStreaming(false);
        return;
      }

      if (data.log) {
        setLogs((prev) => prev + data.log + "\n");
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setStreaming(false);
    };
  };

  const getStatusIcon = () => {
    switch (deployment.status) {
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

  const getStatusColor = () => {
    switch (deployment.status) {
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <h2 className="text-2xl font-bold">{deployment.commitMessage}</h2>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <GitCommit className="h-4 w-4" />
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {deployment.commitSha.substring(0, 7)}
              </code>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {new Date(deployment.startedAt).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className={getStatusColor()}>
            {deployment.status}
          </Badge>

          {deployment.deploymentUrl && (
            <Button size="sm" variant="outline" asChild>
              <a
                href={deployment.deploymentUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Visit Site
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="logs" className="w-full">
        <TabsList>
          <TabsTrigger value="logs">
            <Terminal className="mr-2 h-4 w-4" />
            Build Logs
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Build Logs</CardTitle>
                {streaming && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Streaming...
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] w-full" ref={scrollRef}>
                <pre className="text-xs font-mono bg-muted/50 p-4 rounded-lg">
                  {logs || deployment.buildLogs || "No logs available"}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Deployment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Status
                  </p>
                  <p className="text-sm">{deployment.status}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Branch
                  </p>
                  <p className="text-sm">{deployment.branch}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Started At
                  </p>
                  <p className="text-sm">
                    {new Date(deployment.startedAt).toLocaleString()}
                  </p>
                </div>
                {deployment.completedAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Completed At
                    </p>
                    <p className="text-sm">
                      {new Date(deployment.completedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {deployment.errorMessage && (
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Error
                    </p>
                    <p className="text-sm text-red-500">
                      {deployment.errorMessage}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
