"use client";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { SidebarProvider, useSidebar } from "@/contexts/sidebar-context";
import { OnboardingGuard } from "@/components/onboarding-guard";
import { cn } from "@/lib/utils";
import { OrganizationProvider } from "@/contexts/organization-context";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar />
      <main
        className={cn(
          "flex-1 overflow-y-auto p-8 transition-all duration-300",
          isCollapsed ? "ml-16" : "ml-64"
        )}
      >
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrganizationProvider>
      <SidebarProvider>
        <OnboardingGuard>
          <DashboardContent>{children}</DashboardContent>
        </OnboardingGuard>
      </SidebarProvider>
    </OrganizationProvider>
  );
}
