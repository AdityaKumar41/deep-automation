"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApiClient } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Building2 } from "lucide-react";
import slugify from "slugify";
import { useQueryClient } from "@tanstack/react-query";

export default function CreateOrganizationPage() {
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Auto-generate slug
  React.useEffect(() => {
    setSlug(slugify(name, { lower: true, strict: true }));
  }, [name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);

      // First, ensure user is synced from Clerk to database
      try {
        await api.post("/api/organizations/sync-user");
      } catch (syncErr) {
        console.warn("User sync warning:", syncErr);
        // Continue anyway - the sync might have already happened
      }

      const res = await api.post("/api/organizations", { name, slug });

      // Invalidate organizations query to refresh the cache
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });

      toast.success("Organization created!");
      router.push("/dashboard");
    } catch (err: any) {
      console.error(err);
      toast.error(
        err.response?.data?.message || "Failed to create organization"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
        </div>
        <CardTitle className="text-2xl">Create your Organization</CardTitle>
        <CardDescription>
          Organizations allow you to collaborate with your team and group
          projects.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Organization Slug</Label>
            <div className="flex items-center space-x-2">
              <span className="text-muted-foreground text-sm">evolvx.ai/</span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                className="font-mono text-sm"
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              This will be the unique identifier for your organization.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !name}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Organization
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
