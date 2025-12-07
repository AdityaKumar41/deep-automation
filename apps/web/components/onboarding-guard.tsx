"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApiClient } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface OnboardingGuardProps {
  children: React.ReactNode;
  requiresOnboarding?: boolean;
}

/**
 * OnboardingGuard - Ensures user has completed onboarding before accessing protected routes
 */
export function OnboardingGuard({
  children,
  requiresOnboarding = false,
}: OnboardingGuardProps) {
  const [isChecking, setIsChecking] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);
  const router = useRouter();
  const api = useApiClient();

  useEffect(() => {
    // Prevent multiple checks
    if (hasChecked) return;

    const checkStatus = async () => {
      try {
        // Sync user from Clerk
        try {
          await api.post('/api/organizations/sync-user');
        } catch (syncErr) {
          console.warn('User sync warning:', syncErr);
        }

        // Check if user has organization
        const orgsResponse = await api.get('/api/organizations');
        const organizations = orgsResponse.data.organizations || [];
        
        const needsOnboarding = organizations.length === 0;

        if (requiresOnboarding) {
          // This is an onboarding page - if they've completed onboarding, redirect to dashboard
          if (!needsOnboarding) {
            setHasChecked(true);
            router.replace("/dashboard");
            return;
          }
        } else {
          // This is a protected page - if they need onboarding, redirect to onboarding flow
          if (needsOnboarding) {
            setHasChecked(true);
            router.replace("/onboarding/organization");
            return;
          }
        }

        setIsChecking(false);
        setHasChecked(true);
      } catch (error) {
        console.error("Onboarding check failed:", error);
        // On error, just show the page to avoid infinite loops
        setIsChecking(false);
        setHasChecked(true);
      }
    };

    checkStatus();
  }, [api, router, requiresOnboarding, hasChecked]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
