'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Rocket, Clock, ExternalLink, PlayCircle, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api';
import { Terminal } from '@/components/terminal/terminal';

export default function ProjectDeploymentsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const api = useApiClient();

  // Fetch deployments with auto-refresh
  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments', projectId],
    queryFn: async () => {
      const res = await api.get(`/api/deployments/projects/${projectId}/deployments`);
      return res.data.deployments || [];
    },
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  // Get the latest deployment
  const latestDeployment = deployments?.[0];
  
  // Check if there's an active deployment
  const hasActiveDeployment = latestDeployment && 
    (latestDeployment.status === 'BUILDING' || latestDeployment.status === 'DEPLOYING' || latestDeployment.status === 'PENDING');

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'FAILED':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'BUILDING':
      case 'DEPLOYING':
      case 'PENDING':
        return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'FAILED':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'BUILDING':
      case 'DEPLOYING':
      case 'PENDING':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Deployments</h2>
          <p className="text-muted-foreground">
            {hasActiveDeployment 
              ? 'Deployment in progress - watch the terminal below'
              : 'Chat with AI to deploy your project'}
          </p>
        </div>
      </div>

      {/* Active Deployment Terminal */}
      {hasActiveDeployment && latestDeployment && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(latestDeployment.status)}
                <div>
                  <CardTitle>Current Deployment</CardTitle>
                  <CardDescription>
                    Version {latestDeployment.version} • Started {format(new Date(latestDeployment.startedAt), 'h:mm a')}
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className={getStatusColor(latestDeployment.status)}>
                {latestDeployment.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Terminal deploymentId={latestDeployment.id} height="400px" />
          </CardContent>
        </Card>
      )}

      {/* Latest Completed Deployment */}
      {!hasActiveDeployment && latestDeployment && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(latestDeployment.status)}
                <div>
                  <CardTitle>Latest Deployment</CardTitle>
                  <CardDescription>
                    Version {latestDeployment.version} • {format(new Date(latestDeployment.startedAt), "MMM d 'at' h:mm a")}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={getStatusColor(latestDeployment.status)}>
                  {latestDeployment.status}
                </Badge>
                {latestDeployment.deployUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={latestDeployment.deployUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Visit Site
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Terminal deploymentId={latestDeployment.id} height="400px" />
          </CardContent>
        </Card>
      )}

      {/* Deployment History */}
      <Card>
        <CardHeader>
          <CardTitle>Deployment History</CardTitle>
          <CardDescription>All deployments for this project</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : deployments && deployments.length > 0 ? (
            <div className="space-y-2">
              {deployments.map((deployment: any) => (
                <div
                  key={deployment.id}
                  className="p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(deployment.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {deployment.version}
                          </p>
                          <Badge
                            variant="outline"
                            className={getStatusColor(deployment.status)}
                          >
                            {deployment.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {format(
                            new Date(deployment.startedAt),
                            "MMM d, yyyy 'at' h:mm a"
                          )}
                          {deployment.completedAt && (
                            <>
                              {' • '}
                              Duration: {Math.round(
                                (new Date(deployment.completedAt).getTime() - 
                                 new Date(deployment.startedAt).getTime()) / 1000
                              )}s
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    {deployment.deployUrl && (
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={deployment.deployUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-12">
              <Rocket className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">No deployments yet</p>
              <p className="text-sm">Ask the AI to deploy your project in the chat</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
