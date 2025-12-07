import { Octokit } from '@octokit/rest';
import { FRAMEWORK_PATTERNS, DEFAULT_BUILD_COMMANDS, DEFAULT_START_COMMANDS } from '@evolvx/shared';
import { chatCompletion } from './openai';
import { storeRepoAnalysis } from './qdrant';

export interface RepoAnalysisResult {
  framework: string | null;
  packageManager: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  port: number | null;
  dependencies: string[];
  devDependencies: string[];
  envVars: string[];
  structure: {
    hasDockerfile: boolean;
    hasPackageJson: boolean;
    hasRequirementsTxt: boolean;
    hasGoMod: boolean;
    hasCargoToml: boolean;
    directories: string[];
    mainFiles: string[];
  };
  analysis: string;
}

/**
 * Analyze a GitHub repository
 */
export async function analyzeRepository(
  repoUrl: string,
  installationId?: number
): Promise<RepoAnalysisResult> {
  // Extract owner and repo from URL
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (!match) {
    throw new Error('Invalid GitHub repository URL');
  }

  const [, owner, repo] = match;

  // Create Octokit instance
  let octokit: Octokit;
  
  if (installationId) {
    // Use installation token for private repos
    const { createAppAuth } = await import('@octokit/auth-app');
    const fs = await import('fs');
    const path = await import('path');
    
    // Read private key from file
    let privateKey: string;
    const privateKeyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
    
    if (privateKeyPath) {
      // Read from file path
      const fullPath = path.isAbsolute(privateKeyPath)
        ? privateKeyPath
        : path.join(process.cwd(), privateKeyPath);
      privateKey = fs.readFileSync(fullPath, 'utf-8');
    } else if (process.env.GITHUB_APP_PRIVATE_KEY) {
      // Fallback to env var
      privateKey = process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
    } else {
      throw new Error('GitHub App private key not configured. Set GITHUB_PRIVATE_KEY_PATH or GITHUB_APP_PRIVATE_KEY');
    }
    
    const auth = createAppAuth({
      appId: process.env.GITHUB_APP_ID!,
      privateKey,
    });

    const installationAuth = await auth({
      type: 'installation',
      installationId,
    });

    octokit = new Octokit({
      auth: installationAuth.token,
    });
  } else {
    // Use personal access token for public repos
    octokit = new Octokit({
      auth: process.env.GITHUB_PERSONAL_TOKEN,
    });
  }

  try {
    // Fetch repository contents
    const { data: contents } = await octokit.repos.getContent({
      owner,
      repo,
      path: '',
    });

    if (!Array.isArray(contents)) {
      throw new Error('Unable to read repository contents');
    }

    // Analyze structure
    const structure = {
      hasDockerfile: contents.some((f) => f.name === 'Dockerfile'),
      hasPackageJson: contents.some((f) => f.name === 'package.json'),
      hasRequirementsTxt: contents.some((f) => f.name === 'requirements.txt'),
      hasGoMod: contents.some((f) => f.name === 'go.mod'),
      hasCargoToml: contents.some((f) => f.name === 'Cargo.toml'),
      directories: contents.filter((f) => f.type === 'dir').map((f) => f.name),
      mainFiles: contents.filter((f) => f.type === 'file').map((f) => f.name),
    };

    // Detect framework
    const framework = await detectFramework(octokit, owner, repo, structure);

    // Get package.json if exists
    let dependencies: string[] = [];
    let devDependencies: string[] = [];
    let packageManager = 'npm';

    if (structure.hasPackageJson) {
      const packageData = await getFileContent(octokit, owner, repo, 'package.json');
      if (packageData) {
        const pkg = JSON.parse(packageData);
        dependencies = Object.keys(pkg.dependencies || {});
        devDependencies = Object.keys(pkg.devDependencies || {});
        
        // Detect package manager
        if (contents.some((f) => f.name === 'pnpm-lock.yaml')) {
          packageManager = 'pnpm';
        } else if (contents.some((f) => f.name === 'yarn.lock')) {
          packageManager = 'yarn';
        }
      }
    }

    // Get Python requirements
    if (structure.hasRequirementsTxt) {
      const reqsData = await getFileContent(octokit, owner, repo, 'requirements.txt');
      if (reqsData) {
        dependencies = reqsData
          .split('\n')
          .filter((line) => line.trim() && !line.startsWith('#'))
          .map((line) => line.split('==')[0].split('>=')[0].trim());
      }
      packageManager = 'pip';
    }

    // Detect environment variables
    const envVars = await detectEnvVars(octokit, owner, repo, framework);

    // Detect port
    const port = await detectPort(octokit, owner, repo, framework);

    // Get default commands based on framework
    const buildCommand = framework ? (DEFAULT_BUILD_COMMANDS as any)[framework] : null;
    const startCommand = framework ? (DEFAULT_START_COMMANDS as any)[framework] : null;

    // Generate AI analysis (optional - don't fail if OpenAI is unavailable)
    let aiAnalysisContent = '';
    try {
      // Fetch README for context
      let readmeContent = '';
      const readmeNames = ['README.md', 'readme.md', 'README', 'Readme.md'];
      for (const readmeName of readmeNames) {
        if (structure.mainFiles.includes(readmeName)) {
          const content = await getFileContent(octokit, owner, repo, readmeName);
          if (content) {
            readmeContent = content.substring(0, 2000); // Limit to 2000 chars
            break;
          }
        }
      }

      // Build comprehensive analysis prompt
      const analysisPrompt = `You are analyzing a GitHub repository. Provide a detailed technical analysis.

## Repository Information
- **Framework**: ${framework || 'Unknown'}
- **Package Manager**: ${packageManager}
- **Build Command**: ${buildCommand || 'Not detected'}
- **Start Command**: ${startCommand || 'Not detected'}

## Directory Structure
Directories: ${structure.directories.join(', ') || 'None'}
Root files: ${structure.mainFiles.join(', ')}

## Dependencies (${dependencies.length} total)
${dependencies.slice(0, 20).join(', ')}${dependencies.length > 20 ? '...' : ''}

## Dev Dependencies (${devDependencies.length} total)
${devDependencies.slice(0, 10).join(', ')}${devDependencies.length > 10 ? '...' : ''}

${readmeContent ? `## README Content\n${readmeContent}` : '## No README found'}

## Analysis Task
Based on the above, provide:
1. What this application does (purpose)
2. Key technologies and patterns used
3. Notable features based on dependencies
4. Potential deployment considerations
5. Any security or configuration notes

Be specific and reference actual dependencies/files you see.`;

      const aiAnalysis = await chatCompletion({
        messages: [
          { role: 'system', content: 'You are an expert SRE and DevOps engineer analyzing repositories. Provide concise, actionable technical analysis based on the ACTUAL data provided. Reference specific dependencies, files, and patterns you observe. Never ask for more information - work with what you have.' },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
        maxTokens: 800,
      });
      aiAnalysisContent = aiAnalysis.content;
    } catch (error) {
      console.error('AI analysis failed (non-critical):', error);
      // Fallback to basic analysis
      aiAnalysisContent = `${framework || 'Unknown'} application with ${dependencies.length} dependencies. Package manager: ${packageManager}. ${structure.hasDockerfile ? 'Includes Docker configuration.' : ''}`;
    }

    const result: RepoAnalysisResult = {
      framework,
      packageManager,
      buildCommand,
      startCommand,
      port,
      dependencies,
      devDependencies,
      envVars,
      structure,
      analysis: aiAnalysisContent,
    };

    return result;
  } catch (error: any) {
    console.error('Repository analysis error:', error);
    throw new Error(`Failed to analyze repository: ${error.message}`);
  }
}

/**
 * Detect framework from repository files
 */
async function detectFramework(
  octokit: Octokit,
  owner: string,
  repo: string,
  structure: any
): Promise<string | null> {
  // Check for framework-specific files
  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    for (const pattern of patterns) {
      if (structure.mainFiles.includes(pattern)) {
        return framework;
      }
    }
  }

  // Check package.json for framework hints
  if (structure.hasPackageJson) {
    const packageData = await getFileContent(octokit, owner, repo, 'package.json');
    if (packageData) {
      const pkg = JSON.parse(packageData);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.next) return 'Next.js';
      if (deps.vite) return 'React (Vite)';
      if (deps['react-scripts']) return 'React (CRA)';
      if (deps.express || deps.fastify) return 'Node.js';
    }
  }

  return null;
}

/**
 * Detect environment variables from common config files
 */
async function detectEnvVars(
  octokit: Octokit,
  owner: string,
  repo: string,
  framework: string | null
): Promise<string[]> {
  const envVars = new Set<string>();

  // Check .env.example
  const envExample = await getFileContent(octokit, owner, repo, '.env.example');
  if (envExample) {
    const matches = envExample.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm);
    for (const match of matches) {
      envVars.add(match[1]);
    }
  }

  // Check common config files
  const configFiles = ['config.js', 'config.ts', 'src/config.ts', 'next.config.js'];
  for (const file of configFiles) {
    const content = await getFileContent(octokit, owner, repo, file);
    if (content) {
      const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
      for (const match of matches) {
        envVars.add(match[1]);
      }
    }
  }

  return Array.from(envVars);
}

/**
 * Detect port from code
 */
async function detectPort(
  octokit: Octokit,
  owner: string,
  repo: string,
  framework: string | null
): Promise<number | null> {
  const files = ['index.js', 'index.ts', 'server.js', 'server.ts', 'src/index.ts', 'src/server.ts', 'main.py', 'app.py'];

  for (const file of files) {
    const content = await getFileContent(octokit, owner, repo, file);
    if (content) {
      // Look for port definitions
      const portMatch = content.match(/port.*?(\d{4,5})/i);
      if (portMatch) {
        return parseInt(portMatch[1]);
      }

      // Look for process.env.PORT defaults
      const envPortMatch = content.match(/process\.env\.PORT.*?(\d{4,5})/);
      if (envPortMatch) {
        return parseInt(envPortMatch[1]);
      }
    }
  }

  // Default ports by framework
  const defaultPorts: Record<string, number> = {
    'Next.js': 3000,
    'Node.js': 3000,
    'React (Vite)': 5173,
    'React (CRA)': 3000,
    'Python (Django)': 8000,
    'Python (Flask)': 5000,
    'Python (FastAPI)': 8000,
    'Go': 8080,
  };

  return framework ? defaultPorts[framework] || null : null;
}

/**
 * Get file content from repository
 */
async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
    });

    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Analyze and store repository (full workflow)
 */
export async function analyzeAndStore(
  projectId: string,
  repoUrl: string,
  installationId?: number
): Promise<RepoAnalysisResult> {
  console.log(`🔍 Starting analysis for project ${projectId}`);
  console.log(`   Repository: ${repoUrl}`);
  console.log(`   Installation ID: ${installationId || 'none'}`);
  
  // Run analysis
  const analysis = await analyzeRepository(repoUrl, installationId);
  
  console.log(`✅ Analysis complete for ${projectId}:`, {
    framework: analysis.framework,
    dependencies: analysis.dependencies.length,
    hasAnalysis: !!analysis.analysis,
  });

  // Store in Qdrant for future RAG
  console.log(`💾 Storing analysis in Qdrant for ${projectId}...`);
  const qdrantResult = await storeRepoAnalysis({
    projectId,
    repoUrl,
    framework: analysis.framework || 'Unknown',
    dependencies: analysis.dependencies,
    structure: analysis.structure,
    analysis: analysis.analysis,
  });

  if (qdrantResult.success) {
    console.log(`✅ Successfully stored in Qdrant for ${projectId}`);
  } else {
    console.error(`❌ Failed to store in Qdrant for ${projectId}:`, qdrantResult.error);
  }

  return analysis;
}
