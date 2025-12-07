"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Eye, EyeOff, Trash2, AlertCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SecretsManagerProps {
  projectId: string;
}

export function SecretsManager({ projectId }: SecretsManagerProps) {
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSecret, setNewSecret] = useState({ key: "", value: "" });

  const api = useApi();
  const queryClient = useQueryClient();

  const { data: secrets, isLoading } = useQuery({
    queryKey: ["secrets", projectId],
    queryFn: () => api.getSecrets(projectId),
  });

  const createMutation = useMutation({
    mutationFn: (data: { key: string; value: string }) =>
      api.createSecret(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets", projectId] });
      setIsDialogOpen(false);
      setNewSecret({ key: "", value: "" });
      toast.success("Secret created successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to create secret");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.deleteSecret(projectId, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets", projectId] });
      toast.success("Secret deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to delete secret");
    },
  });

  const toggleShowSecret = (id: string) => {
    setShowSecret((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const maskValue = (value: string) => {
    return "*".repeat(20);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Environment Variables</CardTitle>
            <CardDescription>
              Manage secrets and environment variables for your project
            </CardDescription>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Secret
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Secret</DialogTitle>
                <DialogDescription>
                  Create a new environment variable or secret
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="key">Key</Label>
                  <Input
                    id="key"
                    placeholder="DATABASE_URL"
                    value={newSecret.key}
                    onChange={(e) =>
                      setNewSecret({ ...newSecret, key: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="value">Value</Label>
                  <Input
                    id="value"
                    type="password"
                    placeholder="Enter secret value"
                    value={newSecret.value}
                    onChange={(e) =>
                      setNewSecret({ ...newSecret, value: e.target.value })
                    }
                  />
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Secrets are encrypted and cannot be retrieved after creation
                  </AlertDescription>
                </Alert>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setNewSecret({ key: "", value: "" });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate(newSecret)}
                  disabled={
                    !newSecret.key ||
                    !newSecret.value ||
                    createMutation.isPending
                  }
                >
                  Add Secret
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading secrets...
          </div>
        ) : secrets && secrets.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {secrets.map((secret) => (
                <TableRow key={secret.id}>
                  <TableCell className="font-mono text-sm">
                    {secret.key}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-2">
                      <span>
                        {showSecret[secret.id]
                          ? secret.value
                          : maskValue(secret.value)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => toggleShowSecret(secret.id)}
                      >
                        {showSecret[secret.id] ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(secret.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => deleteMutation.mutate(secret.key)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No secrets configured yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
