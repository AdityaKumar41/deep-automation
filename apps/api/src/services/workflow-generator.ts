import { FRAMEWORK_PATTERNS, DEFAULT_BUILD_COMMANDS, DEFAULT_START_COMMANDS } from '@evolvx/shared';

export interface WorkflowConfig {
  framework: string;
  packageManager: string;
  buildCommand: string;
  startCommand: string;
  port: number;
  envVars: string[];
}

/**
 * Generate GitHub Actions workflow YAML
 */
export function generateGitHubActionsWorkflow(config: WorkflowConfig): string {
  const { framework, packageManager, buildCommand, envVars, port } = config;

  const installCommand = packageManager === 'pnpm' 
    ? 'pnpm install --frozen-lockfile'
    : packageManager === 'yarn'
    ? 'yarn install --frozen-lockfile'
    : 'npm ci';

  const buildCmd = buildCommand || 'npm run build';

  return `name: Evolvx Deploy

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

env:
${envVars.map((v) => `  ${v}: \${{ secrets.${v} }}`).join('\n')}

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: '${packageManager}'
      
      ${packageManager === 'pnpm' ? `- name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      ` : ''}
      - name: Install dependencies
        run: ${installCommand}
      
      - name: Build application
        run: ${buildCmd}
      
      - name: Run tests
        run: ${packageManager} test
        continue-on-error: true
      
      - name: Deploy to Evolvx
        uses: evolvx-ai/deploy-action@v1
        with:
          api-key: \${{ secrets.EVOLVX_API_KEY }}
          project-id: \${{ secrets.EVOLVX_PROJECT_ID }}
          framework: ${framework}
          port: ${port}
`;
}

/**
 * Generate Trivx Runner configuration
 */
export function generateTrivxRunnerConfig(config: WorkflowConfig) {
  const { framework, packageManager, buildCommand, startCommand, port, envVars } = config;

  return {
    version: '1.0',
    framework,
    runtime: 'nodejs-20',
    package_manager: packageManager,
    build: {
      command: buildCommand,
      output_directory: detectOutputDirectory(framework),
      cache_directories: ['node_modules', '.next/cache', 'dist'],
    },
    start: {
      command: startCommand,
      port,
    },
    environment: envVars.reduce((acc: Record<string, string>, key) => {
      acc[key] = `\${${key}}`;  // Will be replaced at runtime
      return acc;
    }, {}),
    health_check: {
      path: '/api/health',
      interval: 30,
      timeout: 5,
      retries: 3,
    },
    resources: {
      cpu: '1',
      memory: '512Mi',
    },
    scaling: {
      min_instances: 1,
      max_instances: 5,
      target_cpu_utilization: 70,
    },
  };
}

/**
 * Detect output directory based on framework
 */
function detectOutputDirectory(framework: string): string {
  const outputDirs: Record<string, string> = {
    'Next.js': '.next',
    'React (Vite)': 'dist',
    'React (CRA)': 'build',
    'Node.js': 'dist',
    'Python (Django)': '.',
    'Python (Flask)': '.',
    'Python (FastAPI)': '.',
    'Go': '.',
    'Rust': 'target/release',
  };

  return outputDirs[framework] || 'dist';
}

/**
 * Generate Dockerfile based on framework
 */
export function generateDockerfile(config: WorkflowConfig): string {
  const { framework, packageManager, buildCommand, startCommand, port } = config;

  if (framework.includes('Next.js')) {
    return generateNextJsDockerfile(packageManager, port);
  } else if (framework.includes('Node')) {
    return generateNodeDockerfile(packageManager, buildCommand, startCommand, port);
  } else if (framework.includes('Python')) {
    return generatePythonDockerfile(framework, port);
  } else if (framework.includes('Go')) {
    return generateGoDockerfile(port);
  }

  // Generic Node.js fallback
  return generateNodeDockerfile(packageManager, buildCommand, startCommand, port);
}

function generateNextJsDockerfile(packageManager: string, port: number): string {
  const pm = packageManager === 'pnpm' ? 'pnpm' : packageManager === 'yarn' ? 'yarn' : 'npm';
  
  return `FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

${pm === 'pnpm' ? 'RUN npm install -g pnpm' : ''}

COPY package.json ${pm === 'yarn' ? 'yarn.lock' : pm === 'pnpm' ? 'pnpm-lock.yaml' : 'package-lock.json'} ./
RUN ${pm} install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN ${pm} run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV PORT ${port}

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE ${port}

CMD ["node", "server.js"]
`;
}

function generateNodeDockerfile(packageManager: string, buildCmd: string, startCmd: string, port: number): string {
  const pm = packageManager === 'pnpm' ? 'pnpm' : packageManager === 'yarn' ? 'yarn' : 'npm';
  
  return `FROM node:20-alpine

${pm === 'pnpm' ? 'RUN npm install -g pnpm' : ''}

WORKDIR /app

COPY package*.json ${pm === 'yarn' ? 'yarn.lock' : pm === 'pnpm' ? 'pnpm-lock.yaml' : ''} ./

RUN ${pm} install --frozen-lockfile

COPY . .

${buildCmd ? `RUN ${buildCmd}` : ''}

ENV PORT ${port}
ENV NODE_ENV production

EXPOSE ${port}

USER node

CMD ${startCmd ? `["${startCmd.split(' ')[0]}", "${startCmd.split(' ').slice(1).join('", "')}"]` : '["node", "index.js"]'}
`;
}

function generatePythonDockerfile(framework: string, port: number): string {
  return `FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT ${port}
ENV PYTHONUNBUFFERED 1

EXPOSE ${port}

${framework.includes('Django') 
  ? `CMD ["gunicorn", "--bind", "0.0.0.0:${port}", "wsgi:application"]`
  : framework.includes('FastAPI')
  ? `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${port}"]`
  : `CMD ["python", "app.py"]`
}
`;
}

function generateGoDockerfile(port: number): string {
  return `FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o main .

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=builder /app/main .

ENV PORT ${port}

EXPOSE ${port}

CMD ["./main"]
`;
}

/**
 * Generate deployment script
 */
export function generateDeploymentScript(framework: string): string {
  return `#!/bin/bash
set -e

echo "🚀 Starting deployment for ${framework}..."

# Build Docker image
echo "📦 Building Docker image..."
docker build -t evolvx-app:latest .

# Tag for registry
echo "🏷️  Tagging image..."
docker tag evolvx-app:latest registry.evolvx.io/$PROJECT_ID:$VERSION

# Push to registry
echo "⬆️  Pushing to registry..."
docker push registry.evolvx.io/$PROJECT_ID:$VERSION

# Deploy to cluster
echo "🌐 Deploying to cluster..."
kubectl set image deployment/$PROJECT_ID $PROJECT_ID=registry.evolvx.io/$PROJECT_ID:$VERSION

# Wait for rollout
echo "⏳ Waiting for rollout..."
kubectl rollout status deployment/$PROJECT_ID

echo "✅ Deployment complete!"
`;
}
