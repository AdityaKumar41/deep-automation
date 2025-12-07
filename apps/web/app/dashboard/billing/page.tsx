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
import { Progress } from "@/components/ui/progress";
import { Check, Zap, TrendingUp, Crown } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/organization-context";

export default function BillingPage() {
  const api = useApi();
  const { currentOrganization } = useOrganization();

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return null;
      return api.getSubscription(currentOrganization.id);
    },
    enabled: !!currentOrganization,
  });

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["usage", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return null;
      return api.getUsage(currentOrganization.id);
    },
    enabled: !!currentOrganization,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!currentOrganization) throw new Error("No organization selected");
      return api.createCheckoutSession(currentOrganization.id, productId);
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.error || "Failed to create checkout session"
      );
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
        if (!currentOrganization) throw new Error("No organization selected");
        return api.createCustomerPortalSession(currentOrganization.id);
    },
    onSuccess: (data) => {
        window.location.href = data.url;
    },
    onError: (error: any) => {
        toast.error(error.response?.data?.error || "Failed to create portal session");
    }
  });

  const handlePortal = () => {
      portalMutation.mutate();
  };

  const plans = [
    {
      name: "Free",
      price: "$0",
      description: "Perfect for personal projects",
      features: [
        "2 projects",
        "100 deployments/month",
        "1 GB storage",
        "10 GB bandwidth",
        "Community support",
      ],
      productId: null, // Free tier has no productId
      current: subscription?.plan === "FREE",
    },
    {
      name: "Pro",
      price: "$19",
      description: "For professional developers",
      features: [
        "Unlimited projects",
        "1000 build minutes/month",
        "10 GB storage",
        "100 GB bandwidth",
        "Priority support",
        "Advanced analytics",
        "Custom domains",
      ],
      productId: process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_PRO_MONTHLY,
      current: subscription?.plan === "PRO",
      popular: true,
    },
    {
      name: "Team",
      price: "$49",
      description: "For growing teams",
      features: [
        "Everything in Pro",
        "Team collaboration",
        "10 team members",
        "5000 build minutes/month",
        "100 GB storage",
        "1 TB bandwidth",
        "SSO authentication",
        "Dedicated support",
        "SLA guarantee",
      ],
      productId: process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_TEAM_MONTHLY,
      current: subscription?.plan === "TEAM",
    },
  ];

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Billing & Usage</h1>
        <p className="text-muted-foreground">
          Manage your subscription and monitor usage
        </p>
      </div>

      {/* Current Plan */}
      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>
              You are on the {subscription.plan} plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      subscription.status === "ACTIVE"
                        ? "default"
                        : "destructive"
                    }
                  >
                    {subscription.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(
                      subscription.currentPeriodStart
                    ).toLocaleDateString()}{" "}
                    -{" "}
                    {new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <Button variant="outline" onClick={handlePortal} disabled={portalMutation.isPending}>
                  {portalMutation.isPending ? "Loading..." : "Manage Subscription"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage Stats */}
      {usage && (
        <Card>
          <CardHeader>
            <CardTitle>Usage This Period</CardTitle>
            <CardDescription>Track your resource consumption</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Deployments</span>
                <span className="font-medium">{usage.deployments} / 100</span>
              </div>
              <Progress value={(usage.deployments / 100) * 100} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Build Minutes</span>
                <span className="font-medium">{usage.buildMinutes} / 300</span>
              </div>
              <Progress value={(usage.buildMinutes / 300) * 100} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Storage</span>
                <span className="font-medium">{usage.storageGB} GB / 1 GB</span>
              </div>
              <Progress value={(usage.storageGB / 1) * 100} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Bandwidth</span>
                <span className="font-medium">
                  {usage.bandwidthGB} GB / 10 GB
                </span>
              </div>
              <Progress value={(usage.bandwidthGB / 10) * 100} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Plans */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Upgrade Your Plan</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={plan.popular ? "border-primary shadow-lg" : ""}
            >
              {plan.popular && (
                <div className="bg-primary text-primary-foreground text-center py-1 text-sm font-medium rounded-t-lg">
                  Most Popular
                </div>
              )}
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.current && <Badge variant="secondary">Current</Badge>}
                </div>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Check className="h-4 w-4 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  variant={plan.current ? "outline" : "default"}
                  disabled={
                    plan.current || !plan.productId || checkoutMutation.isPending
                  }
                  onClick={() =>
                    plan.productId && checkoutMutation.mutate(plan.productId)
                  }
                >
                  {plan.current ? "Current Plan" : "Upgrade"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
