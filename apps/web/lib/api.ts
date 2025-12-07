import axios, { AxiosInstance } from "axios";
import { useAuth } from "@clerk/nextjs";
import { useMemo } from "react";
import type {
  Organization,
  CreateOrganizationInput,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  Deployment,
  DeploymentMetrics,
  Secret,
  CreateSecretInput,
  ChatSession,
  ChatMessage,
  BillingSubscription,
  BillingUsage,
  GitHubRepository,
  Notification,
  ApiResponse,
  PaginatedResponse,
} from "./types";

// Base API client creator
const createApiClient = (token?: string): AxiosInstance => {
  const instance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  return instance;
};

// React hook for API client
export const useApiClient = () => {
  const { getToken } = useAuth();

  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
      headers: {
        "Content-Type": "application/json",
      },
    });

    instance.interceptors.request.use(async (config) => {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    return instance;
  }, [getToken]);

  return api;
};

// API service class
export class ApiClient {
  constructor(private client: AxiosInstance) {}

  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    const { data } =
      await this.client.get<ApiResponse<Organization[]>>("/api/organizations");
    return data.data || [];
  }

  async createOrganization(
    input: CreateOrganizationInput
  ): Promise<Organization> {
    const { data } = await this.client.post<ApiResponse<Organization>>(
      "/api/organizations",
      input
    );
    return data.data!;
  }

  async getOrganization(id: string): Promise<Organization> {
    const { data } = await this.client.get<ApiResponse<Organization>>(
      `/api/organizations/${id}`
    );
    return data.data!;
  }

  async inviteMember(
    organizationId: string,
    email: string,
    role: string
  ): Promise<void> {
    await this.client.post(`/api/organizations/${organizationId}/invite`, {
      email,
      role,
    });
  }

  async removeMember(organizationId: string, memberId: string): Promise<void> {
    await this.client.delete(
      `/api/organizations/${organizationId}/members/${memberId}`
    );
  }

  // Billing
  async getSubscription(organizationId: string): Promise<any> {
    const org = await this.getOrganization(organizationId);
    return org.subscription;
  }

  async getUsage(organizationId: string): Promise<any> {
    return {
        deployments: 0,
        buildMinutes: 0,
        storageGB: 0,
        bandwidthGB: 0,
    };
  }

  async createCheckoutSession(organizationId: string, productId: string): Promise<{ url: string }> {
    const { data } = await this.client.post<{ url: string }>("/api/billing/checkout", {
      organizationId,
      productId,
    });
    return data;
  }

  async createCustomerPortalSession(organizationId: string): Promise<{ url: string }> {
    const { data } = await this.client.get<{ url: string }>(`/api/billing/portal/${organizationId}`);
    return data;
  }

  // Projects
  async getProjects(organizationId: string): Promise<Project[]> {
    const { data } = await this.client.get<ApiResponse<Project[]>>(
      `/api/organizations/${organizationId}/projects`
    );
    return data.data || [];
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const { data } = await this.client.post<ApiResponse<Project>>(
      "/api/projects",
      input
    );
    return data.data!;
  }

  async getProject(id: string): Promise<Project> {
    const { data } = await this.client.get<ApiResponse<Project>>(
      `/api/projects/${id}`
    );
    return data.data!;
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    const { data } = await this.client.patch<ApiResponse<Project>>(
      `/api/projects/${id}`,
      input
    );
    return data.data!;
  }

  async deleteProject(id: string): Promise<void> {
    await this.client.delete(`/api/projects/${id}`);
  }

  // Deployments
  async getDeployments(projectId: string): Promise<Deployment[]> {
    const { data } = await this.client.get<ApiResponse<Deployment[]>>(
      `/api/projects/${projectId}/deployments`
    );
    return data.data || [];
  }

  async createDeployment(
    projectId: string,
    branch?: string
  ): Promise<Deployment> {
    const { data } = await this.client.post<ApiResponse<Deployment>>(
      `/api/projects/${projectId}/deployments`,
      { branch }
    );
    return data.data!;
  }

  async getDeployment(id: string): Promise<Deployment> {
    const { data } = await this.client.get<ApiResponse<Deployment>>(
      `/api/deployments/${id}`
    );
    return data.data!;
  }

  async cancelDeployment(id: string): Promise<void> {
    await this.client.post(`/api/deployments/${id}/cancel`);
  }

  async getDeploymentMetrics(id: string): Promise<DeploymentMetrics[]> {
    const { data } = await this.client.get<ApiResponse<DeploymentMetrics[]>>(
      `/api/deployments/${id}/metrics`
    );
    return data.data || [];
  }

  // Secrets
  async getSecrets(projectId: string): Promise<Secret[]> {
    const { data } = await this.client.get<ApiResponse<Secret[]>>(
      `/api/projects/${projectId}/secrets`
    );
    return data.data || [];
  }

  async createSecret(
    projectId: string,
    input: CreateSecretInput
  ): Promise<Secret> {
    const { data } = await this.client.post<ApiResponse<Secret>>(
      `/api/projects/${projectId}/secrets`,
      input
    );
    return data.data!;
  }

  async deleteSecret(projectId: string, key: string): Promise<void> {
    await this.client.delete(`/api/projects/${projectId}/secrets/${key}`);
  }

  // Chat
  async getChatSessions(projectId: string): Promise<ChatSession[]> {
    const { data } = await this.client.get<ApiResponse<ChatSession[]>>(
      `/api/projects/${projectId}/chat/sessions`
    );
    return data.data || [];
  }

  async createChatSession(
    projectId: string,
    title?: string
  ): Promise<ChatSession> {
    const { data } = await this.client.post<ApiResponse<ChatSession>>(
      `/api/projects/${projectId}/chat/sessions`,
      { title }
    );
    return data.data!;
  }

  async getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    const { data } = await this.client.get<ApiResponse<ChatMessage[]>>(
      `/api/chat/sessions/${sessionId}/messages`
    );
    return data.data || [];
  }


  // GitHub
  async getGitHubRepositories(): Promise<GitHubRepository[]> {
    const { data } = await this.client.get<ApiResponse<GitHubRepository[]>>(
      "/api/github/repositories"
    );
    return data.data || [];
  }

  async connectGitHub(projectId: string, repositoryId: number): Promise<void> {
    await this.client.post(`/api/projects/${projectId}/connect-github`, {
      repositoryId,
    });
  }

  // Notifications
  async getNotifications(): Promise<Notification[]> {
    const { data } =
      await this.client.get<ApiResponse<Notification[]>>("/api/notifications");
    return data.data || [];
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.client.patch(`/api/notifications/${id}/read`);
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.client.post("/api/notifications/read-all");
  }
}

// Hook to use API client with methods
export const useApi = () => {
  const client = useApiClient();
  return useMemo(() => new ApiClient(client), [client]);
};
