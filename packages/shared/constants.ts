// Plan Limits
export const PLAN_LIMITS = {
  FREE: {
    projects: 3,
    deploymentsPerMonth: 10,
    buildMinutesPerMonth: 100,
    storageGB: 1,
    bandwidthGB: 10,
    teamMembers: 1,
  },
  PRO: {
    projects: Infinity,
    deploymentsPerMonth: Infinity,
    buildMinutesPerMonth: 1000,
    storageGB: 50,
    bandwidthGB: 500,
    teamMembers: 5,
  },
  TEAM: {
    projects: Infinity,
    deploymentsPerMonth: Infinity,
    buildMinutesPerMonth: 5000,
    storageGB: 500,
    bandwidthGB: 5000,
    teamMembers: Infinity,
  },
} as const;

// Framework Detection Patterns
export const FRAMEWORK_PATTERNS = {
  'Next.js': ['next.config.js', 'next.config.mjs', 'next.config.ts'],
  'React (Vite)': ['vite.config.js', 'vite.config.ts'],
  'React (CRA)': ['react-scripts'],
  'Node.js': ['package.json'],
  'Python (Django)': ['manage.py', 'settings.py'],
  'Python (Flask)': ['app.py', 'wsgi.py'],
  'Python (FastAPI)': ['main.py'],
  'Go': ['go.mod', 'main.go'],
  'Rust': ['Cargo.toml'],
  'Docker': ['Dockerfile'],
} as const;

// Default Build Commands
export const DEFAULT_BUILD_COMMANDS = {
  'Next.js': 'npm install && npm run build',
  'React (Vite)': 'npm install && npm run build',
  'React (CRA)': 'npm install && npm run build',
  'Node.js': 'npm install',
  'Python (Django)': 'pip install -r requirements.txt && python manage.py collectstatic --noinput',
  'Python (Flask)': 'pip install -r requirements.txt',
  'Python (FastAPI)': 'pip install -r requirements.txt',
  'Go': 'go build -o app',
  'Rust': 'cargo build --release',
} as const;

// Default Start Commands
export const DEFAULT_START_COMMANDS = {
  'Next.js': 'npm start',
  'React (Vite)': 'npm run preview',
  'React (CRA)': 'serve -s build',
  'Node.js': 'node index.js',
  'Python (Django)': 'gunicorn myproject.wsgi:application',
  'Python (Flask)': 'gunicorn app:app',
  'Python (FastAPI)': 'uvicorn main:app --host 0.0.0.0 --port 8000',
  'Go': './app',
  'Rust': './target/release/app',
} as const;

// MCP Capabilities
export const MCP_CAPABILITIES = [
  'deployment.trigger',
  'deployment.status',
  'deployment.logs',
  'metrics.query',
  'alerts.configure',
  'repo.analyze',
] as const;

// Metric Collection Interval (ms)
export const METRIC_COLLECTION_INTERVAL = 30000; // 30 seconds

// Build Timeout (ms)
export const BUILD_TIMEOUT = 600000; // 10 minutes

// AI Model Configuration
export const AI_MODELS = {
  chat: 'gpt-4o',
  embedding: 'text-embedding-3-large',
  codeAnalysis: 'gpt-4o',
} as const;

// Qdrant Collections
export const QDRANT_COLLECTIONS = {
  repoAnalysis: 'repo_analysis_embeddings',
  deploymentLogs: 'deployment_logs_embeddings',
  code: 'code_embeddings',
  chatHistory: 'chat_history_embeddings',
  errorPatterns: 'error_patterns',
} as const;
