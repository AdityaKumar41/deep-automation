"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    name: "Hobby",
    price: "$0",
    description: "Perfect for side projects and learning.",
    features: [
      "1 Project",
      "Community Support",
      "50 Deployments/mo",
      "Basic AI Usage"
    ]
  },
  {
    name: "Pro",
    price: "$29",
    description: "For professional developers and growing apps.",
    features: [
      "Unlimited Projects",
      "Priority Support",
      "Unlimited Deployments",
      "Advanced AI Agent",
      "Custom Domains"
    ],
    popular: true
  },
  {
    name: "Team",
    price: "$99",
    description: "For teams building serious software.",
    features: [
      "Everything in Pro",
      "Team Collaboration",
      "Role-based Access",
      "Audit Logs",
      "Dedicated Support"
    ]
  }
];

export default function BillingPage() {
  return (
    <div className="space-y-10 py-10">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Simple, transparent pricing</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Choose the plan that's right for you. Change plans or cancel at any time.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {TIERS.map((tier) => (
          <Card 
            key={tier.name}
            className={cn(
              "flex flex-col relative", 
              tier.popular ? "border-primary shadow-lg shadow-primary/10" : "border-border"
            )}
          >
            {tier.popular && (
              <div className="absolute -top-3 left-0 right-0 flex justify-center">
                <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                  Most Popular
                </span>
              </div>
            )}
            <CardHeader>
              <CardTitle className="text-2xl">{tier.name}</CardTitle>
              <CardDescription>{tier.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="mb-6">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                variant={tier.popular ? "default" : "outline"}
                // In a real app, this would redirect to Polar checkout URL
                // api.post('/api/billing/checkout', { priceId: ... })
              >
                {tier.price === "$0" ? "Current Plan" : "Upgrade"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
