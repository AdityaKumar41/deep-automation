'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Rocket, Clock, ExternalLink, PlayCircle } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api';

export default function ProjectDeploymentsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const api = useApiClient();

  // Fetch deployments
  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments', projectId],
    queryFn: async () => {
      const res = await api.get(`/api/deployments?projectId=${projectId}`);
      return res.data.deployments || [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Deployments</h2>
          <p className="text-muted-foreground">View and manage all project deployments</p>
        </div>
        <Button>
          <PlayCircle className="w-4 h-4 mr-2" />
          New Deployment
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deployment History</CardTitle>
          <CardDescription>All deployments for this project</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : deployments && deployments.length > 0 ? (
            <div className="space-y-2">
              {deployments.map((deployment: any) => (
                <Link
                  key={deployment.id}
                  href={`/dashboard/deployments/${deployment.id}`}
                  className="block p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Rocket className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            Deployment #{deployment.id.slice(0, 8)}
                          </p>
                          <Badge
                            variant={
                              deployment.status === 'SUCCESS'
                                ? 'default'
                                : deployment.status === 'FAILED'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {deployment.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {format(
                            new Date(deployment.createdAt),
                            "MMM d, yyyy 'at' h:mm a"
                          )}
                        </p>
                      </div>
                    </div>
                    {deployment.url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={deployment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-12">
              <Rocket className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">No deployments yet</p>
              <p className="text-sm">Deploy your project to see deployment history here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
