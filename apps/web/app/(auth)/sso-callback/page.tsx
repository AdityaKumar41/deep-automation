"use client";

import { ClerkLoaded, ClerkLoading } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApiClient } from "@/lib/api";
import { checkOnboardingStatus } from "@/lib/onboarding";

export default function SSOCallback() {
  const router = useRouter();
  const api = useApiClient();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        // Wait a bit for Clerk to finish authentication
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check onboarding status
        const status = await checkOnboardingStatus(api);

        if (status.needsOnboarding && status.redirectTo) {
          // User needs onboarding - redirect to appropriate step
          router.push(status.redirectTo);
        } else {
          // User has completed onboarding - go to dashboard
          router.push("/dashboard");
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        // On error, default to dashboard (OnboardingGuard will handle it)
        router.push("/dashboard");
      } finally {
        setIsChecking(false);
      }
    };

    handleRedirect();
  }, [router, api]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <ClerkLoading>
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground">
            Completing sign in...
          </p>
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <div className="text-center">
          {isChecking ? (
            <>
              <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-4 text-sm text-muted-foreground">
                Setting up your account...
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Redirecting...</p>
          )}
        </div>
      </ClerkLoaded>
    </div>
  );
}
