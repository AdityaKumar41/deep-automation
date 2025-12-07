/**
 * Onboarding utilities to check user's onboarding status
 */

import { AxiosInstance } from "axios";

export interface OnboardingStatus {
  hasOrganization: boolean;
  hasProject: boolean;
  needsOnboarding: boolean;
  redirectTo: string | null;
}

export async function checkOnboardingStatus(
  api: AxiosInstance
): Promise<OnboardingStatus> {
  try {
    // Check if user has organizations
    const { data: orgsResponse } = await api.get("/api/organizations");
    const organizations = orgsResponse?.organizations || [];
    const hasOrganization = organizations.length > 0;

    if (!hasOrganization) {
      return {
        hasOrganization: false,
        hasProject: false,
        needsOnboarding: true,
        redirectTo: "/onboarding/organization",
      };
    }

    // Check if user has projects
    const { data: projectsResponse } = await api.get("/api/projects");
    const projects = projectsResponse?.projects || [];
    const hasProject = projects.length > 0;

    // Projects are optional - user can create them from dashboard
    // Only organization is required for onboarding
    return {
      hasOrganization: true,
      hasProject: hasProject,
      needsOnboarding: false,
      redirectTo: null,
    };
  } catch (error: any) {
    console.error("Error checking onboarding status:", error);

    // If user not found in database (400 error), they need to be synced from Clerk
    // Don't redirect - let them create the org which will sync the user
    if (
      error?.response?.status === 400 ||
      error?.response?.data?.message?.includes("not found")
    ) {
      return {
        hasOrganization: false,
        hasProject: false,
        needsOnboarding: true,
        redirectTo: "/onboarding/organization",
      };
    }

    // On other errors, assume they're already set up to avoid redirect loops
    return {
      hasOrganization: true,
      hasProject: true,
      needsOnboarding: false,
      redirectTo: null,
    };
  }
}
