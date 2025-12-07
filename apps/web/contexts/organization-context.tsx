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
    staleTime: 0, // Always fetch fresh data
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Set initial organization - prioritize localStorage, then first org
  useEffect(() => {
    if (!isLoading && organizations.length > 0) {
      // Check localStorage for saved org
      const savedOrgId = localStorage.getItem("currentOrganizationId");
      
      if (savedOrgId) {
        // Find saved org in current organizations list
        const savedOrg = organizations.find((o) => o.id === savedOrgId);
        if (savedOrg && (!currentOrganization || currentOrganization.id !== savedOrgId)) {
          setCurrentOrganization(savedOrg);
          return;
        }
      }
      
      // No saved org or not found, use first org
      if (!currentOrganization) {
        setCurrentOrganization(organizations[0]);
        localStorage.setItem("currentOrganizationId", organizations[0].id);
      }
    } else if (!isLoading && organizations.length === 0) {
      setCurrentOrganization(null);
      localStorage.removeItem("currentOrganizationId");
    }
  }, [organizations, isLoading]);

  const setOrganization = useCallback((org: Organization) => {
    setCurrentOrganization(org);
    localStorage.setItem("currentOrganizationId", org.id);
  }, []);

  const refreshOrganizations = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Validate current org still exists in the list
  useEffect(() => {
    if (currentOrganization && organizations.length > 0) {
      const exists = organizations.find(o => o.id === currentOrganization.id);
      if (!exists) {
        setOrganization(organizations[0]);
      }
    }
  }, [organizations, currentOrganization, setOrganization]);


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
