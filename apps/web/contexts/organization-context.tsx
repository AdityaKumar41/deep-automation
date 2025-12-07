"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { Organization } from "@/lib/types";
import { useAuth } from "@clerk/nextjs";

interface OrganizationContextType {
  organizations: Organization[];
  currentOrganization: Organization | null;
  isLoading: boolean;
  setOrganization: (org: Organization) => void;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(
  undefined
);

export function OrganizationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [currentOrganization, setCurrentOrganization] =
    useState<Organization | null>(null);
  const queryClient = useQueryClient();

  const {
    data: organizations = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      return await api.getOrganizations();
    },
    enabled: isLoaded && isSignedIn,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Set initial organization
  useEffect(() => {
    if (organizations.length > 0 && !currentOrganization) {
      // Try to recover from local storage
      const savedOrgId = localStorage.getItem("currentOrganizationId");
      const savedOrg = organizations.find((o) => o.id === savedOrgId);

      if (savedOrg) {
        setCurrentOrganization(savedOrg);
      } else {
        setCurrentOrganization(organizations[0]);
      }
    } else if (organizations.length === 0 && !isLoading) {
       setCurrentOrganization(null);
    }
  }, [organizations, currentOrganization, isLoading]);

  const setOrganization = useCallback((org: Organization) => {
    setCurrentOrganization(org);
    localStorage.setItem("currentOrganizationId", org.id);
  }, []);

  const refreshOrganizations = useCallback(async () => {
    await refetch();
  }, [refetch]);

   // Listen for organization creation to switch to it automatically if needed or just validation
   useEffect(() => {
        if(organizations.length > 0 && currentOrganization) {
            const exists = organizations.find(o => o.id === currentOrganization.id)
            if(!exists) {
                // If the current organization was removed or lost access, switch to the first one
                setOrganization(organizations[0]);
            }
        }
   }, [organizations, currentOrganization, setOrganization])


  return (
    <OrganizationContext.Provider
      value={{
        organizations,
        currentOrganization,
        isLoading,
        setOrganization,
        refreshOrganizations,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error(
      "useOrganization must be used within an OrganizationProvider"
    );
  }
  return context;
}
