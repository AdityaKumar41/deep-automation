"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingProjectRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard where user can create project
    router.replace("/dashboard");
  }, [router]);

  return null;
}
