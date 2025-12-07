import Docker from 'dockerode';
import { nanoid } from 'nanoid';
import tar from 'tar-stream';
import { PassThrough } from 'stream';

const docker = new Docker();

export interface BuildConfig {
  deploymentId: string;
  projectId: string;
  repoUrl: string;
  branch: string;
  commitSha: string;
  dockerfile: string;
  buildCommand?: string;
  envVars: Record<string, string>;
}

export interface ContainerConfig {
  deploymentId: string;
  projectId: string;
  imageName: string;
  port: number;
  envVars: Record<string, string>;
  resourceLimits: {
    memory: string;
    cpuShares: number;
  };
}

/**
 * Build Docker image from repository
 */
export async function buildImage(
  config: BuildConfig,
  onLog?: (log: string) => void
): Promise<{
  success: boolean;
  imageName?: string;
  logs: string;
  error?: string;
}> {
  const { deploymentId, dockerfile, repoUrl, branch, commitSha, projectId } = config;
  const imageName = `evolvx/${deploymentId}:${commitSha.substring(0, 7)}`;
  const tempDir = `/tmp/evolvx-build-${deploymentId}`;

  try {
    // Clone repository
    onLog?.('📦 Cloning repository...\n');
    const { cloneRepository, cleanupRepository, getRepositoryFiles } = await import('./github');
    
    const cloneResult = await cloneRepository({
      repoUrl,
      branch,
      commitSha,
      targetDir: tempDir,
    });

    if (!cloneResult.success) {
      throw new Error(`Failed to clone repository: ${cloneResult.error}`);
    }

    onLog?.('✅ Repository cloned successfully\n');

    // Get all repository files
    const files = await getRepositoryFiles(tempDir);
    onLog?.(`📁 Found ${files.length} files\n`);

    // Create tar archive with Dockerfile and repository files
    const pack = tar.pack();
    
    // Add Dockerfile
    pack.entry({ name: 'Dockerfile' }, dockerfile);
    onLog?.('📝 Added Dockerfile to build context\n');
    
    // Add all repository files
    const fs = await import('fs/promises');
    const path = await import('path');
    
    for (const file of files) {
      const fullPath = path.join(tempDir, file);
      const content = await fs.readFile(fullPath);
      pack.entry({ name: file }, content);
    }
    
    pack.finalize();
    onLog?.('🔨 Starting Docker build...\n');

    // Build image
    const stream = await docker.buildImage(pack, {
      t: imageName,
      labels: {
        'evolvx.deployment': deploymentId,
        'evolvx.project': projectId,
        'evolvx.commit': commitSha,
      },
    });

    // Capture build logs
    let logs = '';
    
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(
        stream,
        (err, result) => {
          if (err) reject(err);
          else resolve();
        },
        (event) => {
          if (event.stream) {
            logs += event.stream;
            onLog?.(event.stream);
          }
          if (event.error) {
            const errorLog = `ERROR: ${event.error}\n`;
            logs += errorLog;
            onLog?.(errorLog);
          }
        }
      );
    });

    // Cleanup cloned repository
    await cleanupRepository(tempDir);
    onLog?.('✅ Build complete!\n');

    return {
      success: true,
      imageName,
      logs,
    };
  } catch (error: any) {
    // Cleanup on error
    const { cleanupRepository } = await import('./github');
    await cleanupRepository(tempDir);
    
    return {
      success: false,
      logs: error.message || 'Build failed',
      error: error.message,
    };
  }
}

/**
 * Run container from built image
 */
export async function runContainer(config: ContainerConfig): Promise<{
  success: boolean;
  containerId?: string;
  error?: string;
}> {
  const { deploymentId, imageName, port, envVars, resourceLimits } = config;
  const containerName = `evolvx-${deploymentId}`;

  try {
    // Check if container already exists
    const existingContainer = docker.getContainer(containerName);
    try {
      await existingContainer.remove({ force: true });
    } catch {
      // Container doesn't exist, continue
    }

    // Create and start container
    const container = await docker.createContainer({
      Image: imageName,
      name: containerName,
      Env: Object.entries(envVars).map(([key, value]) => `${key}=${value}`),
      ExposedPorts: {
        [`${port}/tcp`]: {},
      },
      HostConfig: {
        Memory: parseMemory(resourceLimits.memory),
        CpuShares: resourceLimits.cpuShares,
        PortBindings: {
          [`${port}/tcp`]: [{ HostPort: '0' }], // Random host port
        },
        RestartPolicy: {
          Name: 'unless-stopped',
        },
      },
      Labels: {
        'evolvx.deployment': deploymentId,
        'evolvx.project': config.projectId,
      },
    });

    await container.start();

    // Get container info to find assigned port
    const info = await container.inspect();
    const hostPort = info.NetworkSettings.Ports[`${port}/tcp`]?.[0]?.HostPort;

    return {
      success: true,
      containerId: container.id,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get container logs
 */
export async function getContainerLogs(containerId: string): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 500,
      timestamps: true,
    });

    return logs.toString();
  } catch (error: any) {
    return `Error fetching logs: ${error.message}`;
  }
}

/**
 * Stream container logs
 */
export async function streamContainerLogs(containerId: string): Promise<NodeJS.ReadableStream> {
  const container = docker.getContainer(containerId);
  
  const logStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    timestamps: true,
  });

  return logStream as unknown as NodeJS.ReadableStream;
}

/**
 * Get container stats (CPU, Memory, Network)
 */
export async function getContainerStats(containerId: string): Promise<{
  cpu: number;
  memory: number;
  networkRx: number;
  networkTx: number;
}> {
  try {
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;

    const memoryUsage = stats.memory_stats.usage;
    const memoryLimit = stats.memory_stats.limit;
    const memoryPercent = (memoryUsage / memoryLimit) * 100;

    const networkRx = Object.values(stats.networks || {}).reduce(
      (sum: number, net: any) => sum + (net.rx_bytes || 0),
      0
    );
    const networkTx = Object.values(stats.networks || {}).reduce(
      (sum: number, net: any) => sum + (net.tx_bytes || 0),
      0
    );

    return {
      cpu: cpuPercent || 0,
      memory: memoryPercent || 0,
      networkRx,
      networkTx,
    };
  } catch (error) {
    return { cpu: 0, memory: 0, networkRx: 0, networkTx: 0 };
  }
}

/**
 * Stop and remove container
 */
export async function stopContainer(containerId: string): Promise<boolean> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 10 }); // 10 second grace period
    await container.remove();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Health check for container
 */
export async function checkContainerHealth(
  containerId: string,
  healthCheckPath: string,
  port: number
): Promise<boolean> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    
    if (info.State.Status !== 'running') {
      return false;
    }

    // Get container IP
    const containerIp = info.NetworkSettings.IPAddress;
    
    // Try HTTP health check
    const axios = (await import('axios')).default;
    const response = await axios.get(`http://${containerIp}:${port}${healthCheckPath}`, {
      timeout: 5000,
    });

    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Parse memory string (e.g., "512Mi", "1Gi") to bytes
 */
function parseMemory(memoryStr: string): number {
  const units: Record<string, number> = {
    K: 1024,
    M: 1024 * 1024,
    G: 1024 * 1024 * 1024,
    Ki: 1024,
    Mi: 1024 * 1024,
    Gi: 1024 * 1024 * 1024,
  };

  const match = memoryStr.match(/^(\d+)([KMGT]i?)$/);
  if (!match) {
    return 512 * 1024 * 1024; // Default 512MB
  }

  const [, num, unit] = match;
  return parseInt(num) * (units[unit] || 1);
}

/**
 * List all Evolvx containers
 */
export async function listContainers(): Promise<Array<{
  id: string;
  deploymentId: string;
  projectId: string;
  status: string;
  created: Date;
}>> {
  const containers = await docker.listContainers({
    all: true,
    filters: {
      label: ['evolvx.deployment'],
    },
  });

  return containers.map((c) => ({
    id: c.Id,
    deploymentId: c.Labels['evolvx.deployment'] || '',
    projectId: c.Labels['evolvx.project'] || '',
    status: c.State,
    created: new Date(c.Created * 1000),
  }));
}

export { docker };
