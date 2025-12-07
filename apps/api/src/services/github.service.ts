import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import fs from 'fs';
import path from 'path';

/**
 * GitHub Service
 * Comprehensive service for interacting with GitHub API
 */

export interface RepositoryMetadata {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  size: number;
  topics: string[];
}

export interface RepositoryTree {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
  size: number;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
}

/**
 * Create authenticated Octokit instance
 */
export async function createOctokitInstance(installationId?: number): Promise<Octokit> {
  if (installationId) {
    // Use GitHub App installation token for private repos
    let privateKey: string;
    const privateKeyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
    
    if (privateKeyPath) {
      const fullPath = path.isAbsolute(privateKeyPath)
        ? privateKeyPath
        : path.join(process.cwd(), privateKeyPath);
      privateKey = fs.readFileSync(fullPath, 'utf-8');
    } else if (process.env.GITHUB_APP_PRIVATE_KEY) {
      privateKey = process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
    } else {
      throw new Error('GitHub App private key not configured');
    }
    
    const auth = createAppAuth({
      appId: process.env.GITHUB_APP_ID!,
      privateKey,
    });

    const installationAuth = await auth({
      type: 'installation',
      installationId,
    });

    return new Octokit({
      auth: installationAuth.token,
    });
  } else {
    // Use personal access token for public repos
    return new Octokit({
      auth: process.env.GITHUB_PERSONAL_TOKEN,
    });
  }
}

/**
 * Get repository metadata (stars, forks, description, etc.)
 */
export async function getRepositoryMetadata(
  installationId: number | undefined,
  owner: string,
  repo: string
): Promise<RepositoryMetadata> {
  const octokit = await createOctokitInstance(installationId);
  
  const { data } = await octokit.repos.get({
    owner,
    repo,
  });

  return {
    name: data.name,
    fullName: data.full_name,
    description: data.description,
    language: data.language,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    defaultBranch: data.default_branch,
    isPrivate: data.private,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    pushedAt: data.pushed_at,
    size: data.size,
    topics: data.topics || [],
  };
}

/**
 * Get complete repository file tree
 */
export async function getRepositoryTree(
  installationId: number | undefined,
  owner: string,
  repo: string,
  branch: string = 'main'
): Promise<RepositoryTree[]> {
  const octokit = await createOctokitInstance(installationId);
  
  try {
    // Get the commit SHA for the branch
    const { data: ref } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const commitSha = ref.object.sha;

    // Get the tree recursively
    const { data: tree } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: commitSha,
      recursive: 'true',
    });

    return tree.tree.map((item) => ({
      path: item.path!,
      mode: item.mode!,
      type: item.type as 'blob' | 'tree',
      sha: item.sha!,
      size: item.size,
      url: item.url!,
    }));
  } catch (error: any) {
    // Try 'master' branch if 'main' fails
    if (branch === 'main' && error.status === 404) {
      return getRepositoryTree(installationId, owner, repo, 'master');
    }
    throw error;
  }
}

/**
 * Get single file content
 */
export async function getFileContent(
  installationId: number | undefined,
  owner: string,
  repo: string,
  filePath: string
): Promise<string | null> {
  const octokit = await createOctokitInstance(installationId);
  
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
    });

    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get multiple file contents in batch
 */
export async function getFileContents(
  installationId: number | undefined,
  owner: string,
  repo: string,
  filePaths: string[]
): Promise<FileContent[]> {
  const octokit = await createOctokitInstance(installationId);
  
  const results: FileContent[] = [];

  // Fetch files in parallel with rate limiting
  const batchSize = 5;
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (filePath) => {
        try {
          const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: filePath,
          });

          if ('content' in data && data.content) {
            return {
              path: filePath,
              content: Buffer.from(data.content, 'base64').toString('utf-8'),
              sha: data.sha,
              size: data.size,
            };
          }
          return null;
        } catch (error) {
          return null;
        }
      })
    );

    results.push(...batchResults.filter((r): r is FileContent => r !== null));
  }

  return results;
}

/**
 * Get recent commits
 */
export async function getRecentCommits(
  installationId: number | undefined,
  owner: string,
  repo: string,
  limit: number = 10
): Promise<CommitInfo[]> {
  const octokit = await createOctokitInstance(installationId);
  
  const { data } = await octokit.repos.listCommits({
    owner,
    repo,
    per_page: limit,
  });

  return data.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: {
      name: commit.commit.author?.name || 'Unknown',
      email: commit.commit.author?.email || '',
      date: commit.commit.author?.date || '',
    },
    committer: {
      name: commit.commit.committer?.name || 'Unknown',
      email: commit.commit.committer?.email || '',
      date: commit.commit.committer?.date || '',
    },
  }));
}

/**
 * Get language statistics
 */
export async function getLanguages(
  installationId: number | undefined,
  owner: string,
  repo: string
): Promise<Record<string, number>> {
  const octokit = await createOctokitInstance(installationId);
  
  const { data } = await octokit.repos.listLanguages({
    owner,
    repo,
  });

  return data;
}

/**
 * Get README content
 */
export async function getReadme(
  installationId: number | undefined,
  owner: string,
  repo: string
): Promise<string | null> {
  const octokit = await createOctokitInstance(installationId);
  
  try {
    const { data } = await octokit.repos.getReadme({
      owner,
      repo,
    });

    if (data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract owner and repo from GitHub URL
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (!match) {
    throw new Error('Invalid GitHub repository URL');
  }
  return {
    owner: match[1],
    repo: match[2],
  };
}
