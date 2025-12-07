"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Activity, Cpu, HardDrive, Network, TrendingUp } from "lucide-react";
import { DeploymentMetrics } from "@/lib/types";

interface MetricsDashboardProps {
  deploymentId: string;
}

export function MetricsDashboard({ deploymentId }: MetricsDashboardProps) {
  const [metrics, setMetrics] = useState<DeploymentMetrics[]>([]);
  const [status, setStatus] = useState<"UP" | "DOWN" | "UNKNOWN">("UNKNOWN");

  useEffect(() => {
    // Fetch initial metrics
    fetchMetrics();

    // Poll for new metrics every 5 seconds
    const interval = setInterval(fetchMetrics, 5000);

    return () => clearInterval(interval);
  }, [deploymentId]);

  const fetchMetrics = async () => {
    try {
      const baseURL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(
        `${baseURL}/api/deployments/${deploymentId}/metrics`
      );
      const data = await response.json();

      if (data.success && data.data) {
        setMetrics(data.data);
        // Determine status based on latest metrics
        if (data.data.length > 0) {
          const latest = data.data[data.data.length - 1];
          setStatus(latest.errorCount > 10 ? "DOWN" : "UP");
        }
      }
    } catch (error) {
      console.error("Error fetching metrics:", error);
      setStatus("DOWN");
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const cpuData = metrics.map((m) => ({
    time: formatTime(m.timestamp),
    value: m.cpuUsage,
  }));

  const memoryData = metrics.map((m) => ({
    time: formatTime(m.timestamp),
    value: m.memoryUsage,
  }));

  const networkData = metrics.map((m) => ({
    time: formatTime(m.timestamp),
    in: m.networkIn / 1024 / 1024, // Convert to MB
    out: m.networkOut / 1024 / 1024,
  }));

  const requestData = metrics.map((m) => ({
    time: formatTime(m.timestamp),
    requests: m.requestCount,
    errors: m.errorCount,
    avgResponse: m.avgResponseTime,
  }));

  const latestMetrics = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Monitoring Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Real-time performance metrics
            </p>
          </div>
        </div>

        <Badge
          variant="outline"
          className={
            status === "UP"
              ? "bg-green-500/10 text-green-500 border-green-500/20"
              : status === "DOWN"
                ? "bg-red-500/10 text-red-500 border-red-500/20"
                : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
          }
        >
          <div
            className={`mr-2 h-2 w-2 rounded-full ${
              status === "UP"
                ? "bg-green-500"
                : status === "DOWN"
                  ? "bg-red-500"
                  : "bg-yellow-500"
            }`}
          />
          {status}
        </Badge>
      </div>

      {/* Stats Cards */}
      {latestMetrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {latestMetrics.cpuUsage.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Current utilization
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Memory Usage
              </CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {latestMetrics.memoryUsage.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Current utilization
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Requests</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {latestMetrics.requestCount}
              </div>
              <p className="text-xs text-muted-foreground">Last minute</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Avg Response
              </CardTitle>
              <Network className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {latestMetrics.avgResponseTime}ms
              </div>
              <p className="text-xs text-muted-foreground">Response time</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CPU Chart */}
      <Card>
        <CardHeader>
          <CardTitle>CPU Usage</CardTitle>
          <CardDescription>Last 30 minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={cpuData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Memory Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Memory Usage</CardTitle>
          <CardDescription>Last 30 minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={memoryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Network Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Network Traffic</CardTitle>
          <CardDescription>Incoming and outgoing (MB)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={networkData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="in"
                stroke="#10b981"
                name="Incoming"
              />
              <Line
                type="monotone"
                dataKey="out"
                stroke="#f59e0b"
                name="Outgoing"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Requests Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Request Metrics</CardTitle>
          <CardDescription>Requests, errors, and response time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={requestData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="requests"
                stroke="#3b82f6"
                name="Requests"
              />
              <Line
                type="monotone"
                dataKey="errors"
                stroke="#ef4444"
                name="Errors"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
