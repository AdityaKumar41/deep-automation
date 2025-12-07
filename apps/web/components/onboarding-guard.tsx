"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApiClient } from "@/lib/api";
import { checkOnboardingStatus } from "@/lib/onboarding";
import { Loader2 } from "lucide-react";

interface OnboardingGuardProps {
  children: React.ReactNode;
  requiresOnboarding?: boolean;
}

/**
 * OnboardingGuard - Ensures user has completed onboarding before accessing protected routes
 *
 * @param requiresOnboarding - If true, redirects users who HAVE completed onboarding to dashboard
 *                            If false, redirects users who HAVEN'T completed onboarding to onboarding flow
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
        const status = await checkOnboardingStatus(api);

        if (requiresOnboarding) {
          // This is an onboarding page - if they've completed onboarding, redirect to dashboard
          if (!status.needsOnboarding) {
            setHasChecked(true);
            router.replace("/dashboard");
            return;
          }
        } else {
          // This is a protected page - if they need onboarding, redirect to onboarding flow
          if (status.needsOnboarding && status.redirectTo) {
            setHasChecked(true);
            router.replace(status.redirectTo);
            return;
          }
        }

        setIsChecking(false);
        setHasChecked(true);
      } catch (error) {
        console.error("Onboarding check failed:", error);
        // On error (like user not found in DB), just show the page
        // Don't redirect or we'll get stuck in a loop
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
