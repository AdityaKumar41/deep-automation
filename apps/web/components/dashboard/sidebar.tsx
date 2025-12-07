"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/contexts/sidebar-context";
import { useOrganization } from "@/contexts/organization-context";
import { CreateOrganizationDialog } from "./create-organization-dialog";
import {
  LayoutDashboard,
  FolderGit2,
  Rocket,
  MessageSquare,
  Activity,
  Users,
  CreditCard,
  Settings,
  Bell,
  Github,
  ChevronDown,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Moon, Sun } from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

const navigation: NavItem[] = [
  { title: "Projects", href: "/dashboard", icon: FolderGit2 },
  { title: "Deployments", href: "/dashboard/deployments", icon: Rocket },
  { title: "Monitoring", href: "/dashboard/monitoring", icon: Activity },
  { title: "Team", href: "/dashboard/team", icon: Users },
  { title: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];

// Theme toggle component
function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="h-9 w-9"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const [notifications, setNotifications] = useState(3);
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const { organizations, currentOrganization, setOrganization } =
    useOrganization();
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  return (
    <>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r bg-background transition-all duration-300",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo & Collapse Button */}
        <div className="flex h-16 items-center border-b px-4 justify-between">
          {!isCollapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Rocket className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Evolvx AI
              </span>
            </Link>
          )}
          {isCollapsed && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground mx-auto">
              <Rocket className="h-5 w-5" />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn("h-8 w-8", isCollapsed && "mx-auto mt-2")}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>



        {/* Organization Selector */}
        {!isCollapsed && (
          <div className="border-b px-4 py-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-semibold uppercase">
                      {currentOrganization?.name?.charAt(0) || "+"}
                    </div>
                    <span className="text-sm font-medium truncate max-w-[120px]">
                      {currentOrganization?.name || "Select Organization"}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {organizations.map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => setOrganization(org)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-semibold uppercase">
                        {org.name.charAt(0)}
                      </div>
                      <span>{org.name}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setCreateOrgOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Organization
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  isCollapsed && "justify-center"
                )}
                title={isCollapsed ? item.title : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && (
                  <>
                    {item.title}
                    {item.badge && (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section - User Account */}
        <div className="fixed border-t bottom-0 p-4">
          <div
            className={cn(
              "flex items-center gap-3",
              isCollapsed && "justify-center"
            )}
          >
            <UserButton afterSignOutUrl="/sign-in" />
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">Account</p>
                <p className="text-xs text-muted-foreground truncate">
                  Manage settings
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <CreateOrganizationDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
      />
    </>
  );
}

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 px-6">
      <div className="flex-1">
        <h1 className="text-lg font-semibold">Dashboard</h1>
      </div>

      <div className="flex items-center gap-4">
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>
    </header>
  );
}
