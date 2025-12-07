import * as githubService from './github.service';

/**
 * Metadata Extractor Service
 * Comprehensive repository metadata extraction for DevOps automation
 */

export interface RepoMetadata {
  projectId: string;
  organizationId: string;
  repositoryFullName: string;
  analyzedAt: string;
  
  structure: ProjectStructure;
  build: BuildConfiguration;
  dependencies: DependencyInfo;
  infrastructure: InfrastructureConfig;
  environment: EnvironmentConfig;
  deployment: DeploymentMetadata;
  testing: TestingConfig;
  
  summary: {
    primaryLanguage: string;
    primaryFramework?: string;
    projectType: string;
    deploymentReady: boolean;
    cicdReady: boolean;
  };
}

export interface ProjectStructure {
  type: 'monorepo' | 'single-app';
  workspaces?: string[];
  directories: string[];
  mainFiles: string[];
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
}

export interface BuildConfiguration {
  tool: string; // npm, yarn, pnpm, maven, gradle, cargo, go
  commands: {
    install: string;
    build: string;
    test?: string;
    start: string;
  };
}

export interface DependencyInfo {
  runtime: Record<string, string>;
  development: Record<string, string>;
  framework: string;
  language: string;
}

export interface InfrastructureConfig {
  docker: {
    hasDockerfile: boolean;
    hasDockerCompose: boolean;
    baseImage?: string;
  };
  kubernetes: {
    hasManifests: boolean;
    hasHelm: boolean;
  };
  cicd: {
    provider?: 'github-actions' | 'jenkins' | 'gitlab-ci' | 'circleci';
    configPath?: string;
  };
}

export interface EnvironmentConfig {
  requiredVars: string[];
  detectedVars: string[];
}

export interface DeploymentMetadata {
  port?: number;
  healthCheck?: string;
  entrypoint?: string;
}

export interface TestingConfig {
  framework?: string;
  testCommand?: string;
}

/**
 * Main metadata extraction function
 */
export async function extractMetadata(
  installationId: number | undefined,
  owner: string,
  repoName: string,
  branch: string,
  projectId: string,
  organizationId: string
): Promise<RepoMetadata> {
  console.log(`🔍 Extracting metadata for ${owner}/${repoName}`);

  // Get repository tree
  const tree = await githubService.getRepositoryTree(installationId, owner, repoName, branch);
  
  // Get language statistics
  const languages = await githubService.getLanguages(installationId, owner, repoName);
  
  // Analyze project structure
  const structure = await analyzeProjectStructure(tree);
  
  // Detect framework and language
  const { framework, language } = await detectFrameworkAndLanguage(
    installationId,
    owner,
    repoName,
    tree,
    languages
  );
  
  // Detect build system
  const build = await detectBuildSystem(installationId, owner, repoName, tree, framework);
  
  // Analyze dependencies
  const dependencies = await analyzeDependencies(
    installationId,
    owner,
    repoName,
    tree,
    framework,
    language
  );
  
  // Detect infrastructure
  const infrastructure = await detectInfrastructure(installationId, owner, repoName, tree);
  
  // Extract environment configuration
  const environment = await extractEnvironmentConfig(installationId, owner, repoName, tree);
  
  // Identify deployment metadata
  const deployment = await identifyDeploymentMetadata(
    installationId,
    owner,
    repoName,
    tree,
    framework
  );
  
  // Detect testing framework
  const testing = await detectTestingFramework(installationId, owner, repoName, tree, framework);
  
  return {
    projectId,
    organizationId,
    repositoryFullName: `${owner}/${repoName}`,
    analyzedAt: new Date().toISOString(),
    structure,
    build,
    dependencies,
    infrastructure,
    environment,
    deployment,
    testing,
    summary: {
      primaryLanguage: language,
      primaryFramework: framework,
      projectType: structure.type,
      deploymentReady: structure.hasDockerfile || !!infrastructure.cicd.provider,
      cicdReady: !!infrastructure.cicd.provider,
    },
  };
}

/**
 * Analyze project structure
 */
async function analyzeProjectStructure(
  tree: githubService.RepositoryTree[]
): Promise<ProjectStructure> {
  const directories = tree
    .filter((item) => item.type === 'tree')
    .map((item) => item.path);
  
  const mainFiles = tree
    .filter((item) => item.type === 'blob' && !item.path.includes('/'))
    .map((item) => item.path);
  
  // Detect monorepo
  const hasPackageJson = mainFiles.includes('package.json');
  const hasLernaJson = mainFiles.includes('lerna.json');
  const hasPnpmWorkspace = mainFiles.includes('pnpm-workspace.yaml');
  const hasNxJson = mainFiles.includes('nx.json');
  const hasWorkspaces = directories.some((d) => d === 'packages' || d === 'apps');
  
  const isMonorepo = (hasPackageJson && (hasLernaJson || hasPnpmWorkspace || hasNxJson)) || hasWorkspaces;
  
  // Find workspaces
  let workspaces: string[] = [];
  if (isMonorepo) {
    workspaces = directories.filter((d) => d.startsWith('packages/') || d.startsWith('apps/'));
  }
  
  return {
    type: isMonorepo ? 'monorepo' : 'single-app',
    workspaces: isMonorepo ? workspaces : undefined,
    directories,
    mainFiles,
    hasDockerfile: mainFiles.includes('Dockerfile'),
    hasDockerCompose: mainFiles.includes('docker-compose.yml') || mainFiles.includes('docker-compose.yaml'),
  };
}

/**
 * Detect framework and language
 */
async function detectFrameworkAndLanguage(
  installationId: number | undefined,
  owner: string,
  repo: string,
  tree: githubService.RepositoryTree[],
  languages: Record<string, number>
): Promise<{ framework: string; language: string }> {
  const files = tree.filter((item) => item.type === 'blob').map((item) => item.path);
  
  // Determine primary language
  const languageEntries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  const primaryLanguage = languageEntries[0]?.[0] || 'Unknown';
  
  // Framework detection patterns
  const frameworkPatterns: Record<string, string[]> = {
    'Next.js': ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    'NestJS': ['nest-cli.json'],
    'React (Vite)': ['vite.config.js', 'vite.config.ts'],
    'React (CRA)': ['.env.example'],
    'Express': ['package.json'],
    'Fastify': ['package.json'],
    'Django': ['manage.py', 'settings.py'],
    'Flask': ['app.py', 'wsgi.py'],
    'FastAPI': ['main.py'],
    'Spring Boot': ['pom.xml', 'build.gradle'],
    'Go': ['go.mod', 'main.go'],
    'Rust': ['Cargo.toml'],
  };
  
  // Check for framework-specific files
  for (const [framework, patterns] of Object.entries(frameworkPatterns)) {
    for (const pattern of patterns) {
      if (files.includes(pattern)) {
        // Additional validation for package.json-based frameworks
        if (framework === 'Express' || framework === 'Fastify' || framework === 'React (CRA)') {
          const packageJson = await githubService.getFileContent(installationId, owner, repo, 'package.json');
          if (packageJson) {
            const pkg = JSON.parse(packageJson);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            
            if (framework === 'Express' && deps.express) return { framework, language: primaryLanguage };
            if (framework === 'Fastify' && deps.fastify) return { framework, language: primaryLanguage };
            if (framework === 'React (CRA)' && deps['react-scripts']) return { framework, language: primaryLanguage };
          }
        } else {
          return { framework, language: primaryLanguage };
        }
      }
    }
  }
  
  // Fallback to language-based framework
  if (primaryLanguage === 'TypeScript' || primaryLanguage === 'JavaScript') {
    return { framework: 'Node.js', language: primaryLanguage };
  }
  if (primaryLanguage === 'Python') {
    return { framework: 'Python', language: primaryLanguage };
  }
  
  return { framework: 'Unknown', language: primaryLanguage };
}

/**
 * Detect build system
 */
async function detectBuildSystem(
  installationId: number | undefined,
  owner: string,
  repo: string,
  tree: githubService.RepositoryTree[],
  framework: string
): Promise<BuildConfiguration> {
  const files = tree.filter((item) => item.type === 'blob').map((item) => item.path);
  
  // Detect package manager for Node.js projects
  if (files.includes('package.json')) {
    let packageManager = 'npm';
    if (files.includes('pnpm-lock.yaml')) packageManager = 'pnpm';
    else if (files.includes('yarn.lock')) packageManager = 'yarn';
    
    // Get scripts from package.json
    const packageJson = await githubService.getFileContent(installationId, owner, repo, 'package.json');
    if (packageJson) {
      const pkg = JSON.parse(packageJson);
      const scripts = pkg.scripts || {};
      
      return {
        tool: packageManager,
        commands: {
          install: `${packageManager} install`,
          build: scripts.build ? `${packageManager} run build` : `${packageManager} install`,
          test: scripts.test ? `${packageManager} test` : undefined,
          start: scripts.start ? `${packageManager} start` : 'node index.js',
        },
      };
    }
  }
  
  // Maven
  if (files.includes('pom.xml')) {
    return {
      tool: 'maven',
      commands: {
        install: 'mvn clean install',
        build: 'mvn package',
        test: 'mvn test',
        start: 'java -jar target/*.jar',
      },
    };
  }
  
  // Gradle
  if (files.includes('build.gradle') || files.includes('build.gradle.kts')) {
    return {
      tool: 'gradle',
      commands: {
        install: './gradlew build',
        build: './gradlew build',
        test: './gradlew test',
        start: 'java -jar build/libs/*.jar',
      },
    };
  }
  
  // Python
  if (files.includes('requirements.txt')) {
    return {
      tool: 'pip',
      commands: {
        install: 'pip install -r requirements.txt',
        build: 'pip install -r requirements.txt',
        test: 'pytest',
        start: framework === 'Django' ? 'python manage.py runserver' : 'python app.py',
      },
    };
  }
  
  // Go
  if (files.includes('go.mod')) {
    return {
      tool: 'go',
      commands: {
        install: 'go mod download',
        build: 'go build -o app',
        test: 'go test ./...',
        start: './app',
      },
    };
  }
  
  // Rust
  if (files.includes('Cargo.toml')) {
    return {
      tool: 'cargo',
      commands: {
        install: 'cargo fetch',
        build: 'cargo build --release',
        test: 'cargo test',
        start: './target/release/app',
      },
    };
  }
  
  return {
    tool: 'unknown',
    commands: {
      install: '',
      build: '',
      start: '',
    },
  };
}

/**
 * Analyze dependencies
 */
async function analyzeDependencies(
  installationId: number | undefined,
  owner: string,
  repo: string,
  tree: githubService.RepositoryTree[],
  framework: string,
  language: string
): Promise<DependencyInfo> {
  const files = tree.filter((item) => item.type === 'blob').map((item) => item.path);
  
  let runtime: Record<string, string> = {};
  let development: Record<string, string> = {};
  
  // Node.js dependencies
  if (files.includes('package.json')) {
    const packageJson = await githubService.getFileContent(installationId, owner, repo, 'package.json');
    if (packageJson) {
      const pkg = JSON.parse(packageJson);
      runtime = pkg.dependencies || {};
      development = pkg.devDependencies || {};
    }
  }
  
  // Python dependencies
  if (files.includes('requirements.txt')) {
    const requirements = await githubService.getFileContent(installationId, owner, repo, 'requirements.txt');
    if (requirements) {
      const deps = requirements
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#'))
        .map((line) => {
          const parts = line.split('==');
          return { name: parts[0].trim(), version: parts[1]?.trim() || 'latest' };
        });
      
      runtime = Object.fromEntries(deps.map((d) => [d.name, d.version]));
    }
  }
  
  return {
    runtime,
    development,
    framework,
    language,
  };
}

/**
 * Detect infrastructure
 */
async function detectInfrastructure(
  installationId: number | undefined,
  owner: string,
  repo: string,
  tree: githubService.RepositoryTree[]
): Promise<InfrastructureConfig> {
  const files = tree.filter((item) => item.type === 'blob').map((item) => item.path);
  
  // Docker
  const hasDockerfile = files.includes('Dockerfile');
  const hasDockerCompose = files.includes('docker-compose.yml') || files.includes('docker-compose.yaml');
  
  let baseImage: string | undefined;
  if (hasDockerfile) {
    const dockerfile = await githubService.getFileContent(installationId, owner, repo, 'Dockerfile');
    if (dockerfile) {
      const fromMatch = dockerfile.match(/FROM\s+([^\s]+)/);
      baseImage = fromMatch?.[1];
    }
  }
  
  // Kubernetes
  const hasK8sManifests = files.some((f) => f.includes('k8s/') || f.includes('kubernetes/'));
  const hasHelm = files.some((f) => f.includes('Chart.yaml'));
  
  // CI/CD
  let cicdProvider: InfrastructureConfig['cicd']['provider'];
  let configPath: string | undefined;
  
  if (files.some((f) => f.startsWith('.github/workflows/'))) {
    cicdProvider = 'github-actions';
    configPath = files.find((f) => f.startsWith('.github/workflows/'));
  } else if (files.includes('Jenkinsfile')) {
    cicdProvider = 'jenkins';
    configPath = 'Jenkinsfile';
  } else if (files.includes('.gitlab-ci.yml')) {
    cicdProvider = 'gitlab-ci';
    configPath = '.gitlab-ci.yml';
  } else if (files.includes('.circleci/config.yml')) {
    cicdProvider = 'circleci';
    configPath = '.circleci/config.yml';
  }
  
  return {
    docker: {
      hasDockerfile,
      hasDockerCompose,
      baseImage,
    },
    kubernetes: {
      hasManifests: hasK8sManifests,
      hasHelm,
    },
    cicd: {
      provider: cicdProvider,
      configPath,
    },
  };
}

/**
 * Extract environment configuration
 */
async function extractEnvironmentConfig(
  installationId: number | undefined,
  owner: string,
  repo: string,
  tree: githubService.RepositoryTree[]
): Promise<EnvironmentConfig> {
  const files = tree.filter((item) => item.type === 'blob').map((item) => item.path);
  const envVars = new Set<string>();
  
  // Check .env.example
  if (files.includes('.env.example')) {
    const envExample = await githubService.getFileContent(installationId, owner, repo, '.env.example');
    if (envExample) {
      const matches = envExample.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm);
      for (const match of matches) {
        envVars.add(match[1]);
      }
    }
  }
  
  // Check common config files
  const configFiles = ['config.js', 'config.ts', 'src/config.ts', 'next.config.js'];
  for (const file of configFiles) {
    if (files.includes(file)) {
      const content = await githubService.getFileContent(installationId, owner, repo, file);
      if (content) {
        const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
        for (const match of matches) {
          envVars.add(match[1]);
        }
      }
    }
  }
  
  return {
    requiredVars: Array.from(envVars),
    detectedVars: Array.from(envVars),
  };
}

/**
 * Identify deployment metadata
 */
async function identifyDeploymentMetadata(
  installationId: number | undefined,
  owner: string,
  repo: string,
  tree: githubService.RepositoryTree[],
  framework: string
): Promise<DeploymentMetadata> {
  const files = tree.filter((item) => item.type === 'blob').map((item) => item.path);
  
  let port: number | undefined;
  let healthCheck: string | undefined;
  let entrypoint: string | undefined;
  
  // Check common entry point files for port
  const entryFiles = ['index.js', 'index.ts', 'server.js', 'server.ts', 'src/index.ts', 'src/server.ts', 'main.py', 'app.py'];
  for (const file of entryFiles) {
    if (files.includes(file)) {
      const content = await githubService.getFileContent(installationId, owner, repo, file);
      if (content) {
        // Look for port definitions
        const portMatch = content.match(/port.*?(\d{4,5})/i);
        if (portMatch) {
          port = parseInt(portMatch[1]);
        }
        
        // Look for health check routes
        const healthMatch = content.match(/['"`](\/health|\/healthz|\/ping)['"`]/);
        if (healthMatch) {
          healthCheck = healthMatch[1];
        }
        
        if (!entrypoint) {
          entrypoint = file;
        }
      }
    }
  }
  
  // Default ports by framework
  if (!port) {
    const defaultPorts: Record<string, number> = {
      'Next.js': 3000,
      'Node.js': 3000,
      'Express': 3000,
      'Fastify': 3000,
      'React (Vite)': 5173,
      'Django': 8000,
      'Flask': 5000,
      'FastAPI': 8000,
      'Go': 8080,
    };
    port = defaultPorts[framework];
  }
  
  return {
    port,
    healthCheck,
    entrypoint,
  };
}

/**
 * Detect testing framework
 */
async function detectTestingFramework(
  installationId: number | undefined,
  owner: string,
  repo: string,
  tree: githubService.RepositoryTree[],
  framework: string
): Promise<TestingConfig> {
  const files = tree.filter((item) => item.type === 'blob').map((item) => item.path);
  
  // Node.js testing frameworks
  if (files.includes('package.json')) {
    const packageJson = await githubService.getFileContent(installationId, owner, repo, 'package.json');
    if (packageJson) {
      const pkg = JSON.parse(packageJson);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (deps.jest) return { framework: 'Jest', testCommand: 'npm test' };
      if (deps.vitest) return { framework: 'Vitest', testCommand: 'npm test' };
      if (deps.mocha) return { framework: 'Mocha', testCommand: 'npm test' };
    }
  }
  
  // Python testing frameworks
  if (files.includes('pytest.ini') || files.includes('setup.cfg')) {
    return { framework: 'Pytest', testCommand: 'pytest' };
  }
  
  // Go testing
  if (framework === 'Go') {
    return { framework: 'Go Test', testCommand: 'go test ./...' };
  }
  
  // Rust testing
  if (framework === 'Rust') {
    return { framework: 'Cargo Test', testCommand: 'cargo test' };
  }
  
  return {};
}
