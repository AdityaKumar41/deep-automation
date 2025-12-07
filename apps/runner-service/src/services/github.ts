import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

const execAsync = promisify(exec);

export interface CloneConfig {
  repoUrl: string;
  branch: string;
  commitSha?: string;
  installationId?: number;
  targetDir: string;
}

/**
 * Clone GitHub repository
 */
export async function cloneRepository(config: CloneConfig): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const { repoUrl, branch, commitSha, installationId, targetDir } = config;

  try {
    // Ensure target directory exists
    await fs.mkdir(targetDir, { recursive: true });

    let cloneUrl = repoUrl;

    // If installation ID is provided, use GitHub App token
    if (installationId) {
      const token = await getGitHubAppToken(installationId);
      // Convert https://github.com/owner/repo to https://x-access-token:TOKEN@github.com/owner/repo
      cloneUrl = repoUrl.replace('https://github.com/', `https://x-access-token:${token}@github.com/`);
    }

    // Clone repository
    const cloneCommand = `git clone --depth 1 --branch ${branch} ${cloneUrl} ${targetDir}`;
    await execAsync(cloneCommand);

    // Checkout specific commit if provided
    if (commitSha) {
      await execAsync(`cd ${targetDir} && git fetch --depth 1 origin ${commitSha} && git checkout ${commitSha}`);
    }

    return {
      success: true,
      path: targetDir,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get GitHub App installation token
 */
async function getGitHubAppToken(installationId: number): Promise<string> {
  const auth = createAppAuth({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  });

  const installationAuth = await auth({
    type: 'installation',
    installationId,
  });

  return installationAuth.token;
}

/**
 * Clean up cloned repository
 */
export async function cleanupRepository(targetDir: string): Promise<void> {
  try {
    await fs.rm(targetDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to cleanup repository:', error);
  }
}

/**
 * Get repository files for Docker build context
 */
export async function getRepositoryFiles(repoPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(repoPath, fullPath);

      // Skip .git directory and node_modules
      if (relativePath.startsWith('.git') || relativePath.includes('node_modules')) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        files.push(relativePath);
      }
    }
  }

  await walk(repoPath);
  return files;
}
