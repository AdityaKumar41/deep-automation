# Evolvx AI

**Intelligent DevOps Automation Platform**

Evolvx AI is an AI-powered platform that automates deployment, CI/CD pipeline generation, and infrastructure management. Simply connect your GitHub repository, and Evolvx AI analyzes your codebase to provide intelligent deployment assistance, monitoring, and troubleshooting.

![Evolvx Dashboard](docs/assets/dashboard-preview.png)

---

## ✨ Key Features

### 🤖 AI-Powered Chat Assistant
- **Repository Understanding**: Analyzes your codebase structure, framework, and dependencies
- **Smart Recommendations**: Suggests deployment configurations, CI/CD pipelines, and best practices
- **Troubleshooting**: Helps diagnose deployment failures and application errors

### 🚀 Automated Deployments
- **One-Click Deploy**: Deploy to cloud infrastructure with minimal configuration
- **Multi-Environment**: Support for development, staging, and production environments
- **Rollback Support**: Easily rollback to previous versions if issues occur

### 📊 Monitoring & Metrics
- **Real-time Metrics**: CPU, memory, and network usage monitoring
- **Alert System**: Get notified when metrics exceed thresholds
- **Performance Insights**: AI-powered performance optimization suggestions

### 🔧 CI/CD Pipeline Generation
- **GitHub Actions**: Auto-generate optimized GitHub Actions workflows
- **Docker Integration**: Production-ready Dockerfiles with multi-stage builds
- **Framework-Specific**: Tailored configurations for Next.js, React, Node.js, and more

---

## 🏗 Architecture Overview

Evolvx AI is built as a modern monorepo with three main applications:

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Web App** | Next.js 15, Shadcn UI | User dashboard and chat interface |
| **API Server** | Fastify, Prisma | Backend API, AI processing, webhooks |
| **Runner Service** | Fastify, Docker | Build and deployment execution |

### Supporting Services
- **PostgreSQL**: Primary database
- **Apache Kafka**: Event streaming for async workflows
- **Qdrant**: Vector database for AI memory (RAG)
- **Inngest**: Workflow orchestration engine
- **Clerk**: Authentication and user management

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v20 or higher
- **pnpm** v8+ (`npm install -g pnpm`)
- **Docker** & Docker Compose
- **Inngest CLI** (`npm install -g inngest-cli`)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/evolvx-ai.git
   cd evolvx-ai
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start infrastructure services**
   ```bash
   docker-compose up -d
   ```

4. **Install dependencies**
   ```bash
   pnpm install
   ```

5. **Set up database**
   ```bash
   pnpm db:generate
   pnpm db:push
   ```

6. **Start development servers**
   ```bash
   pnpm dev
   ```

7. **Start Inngest (separate terminal)**
   ```bash
   npx inngest-cli@latest dev -u http://localhost:3001/api/inngest
   ```

### Access Points

| Service | URL |
|---------|-----|
| Web Dashboard | http://localhost:3000 |
| API Server | http://localhost:3001 |
| Runner Service | http://localhost:3002 |
| Inngest Dashboard | http://localhost:8288 |
| Prisma Studio | `pnpm db:studio` |

---

## 📖 How It Works

### 1. Connect Your Repository
Link your GitHub account and import a repository. Evolvx AI uses a GitHub App to securely access your code.

### 2. Automatic Analysis
Once connected, Evolvx AI automatically:
- Detects your framework (Next.js, React, Node.js, etc.)
- Identifies dependencies and dev dependencies
- Reads your README and configuration files
- Stores analysis in a vector database for AI context

### 3. Chat with Your AI Assistant
Open the project chat to interact with your AI assistant:

| Command | What it does |
|---------|--------------|
| "Analyze my repository" | Get detailed codebase analysis |
| "Generate a CI/CD pipeline" | Create GitHub Actions workflow |
| "Deploy this project" | Start deployment process |
| "Why did the build fail?" | Troubleshoot recent errors |
| "Show me CPU usage" | View performance metrics |

### 4. Deploy with Confidence
When you're ready to deploy, Evolvx AI:
- Generates optimized build configurations
- Creates Docker containers
- Monitors the deployment process
- Provides real-time logs and status updates

---

## 🔐 Required API Keys

| Service | Environment Variable | Purpose |
|---------|---------------------|---------|
| **Clerk** | `CLERK_SECRET_KEY` | User authentication |
| **OpenAI** | `OPENAI_API_KEY` | AI chat and analysis |
| **GitHub App** | `GITHUB_APP_PRIVATE_KEY` | Repository access |
| **Qdrant** | `QDRANT_API_KEY` | Vector database (optional for local) |

---

## 📁 Project Structure

```
evolvx-ai/
├── apps/
│   ├── web/           # Next.js frontend
│   ├── api/           # Fastify backend API
│   └── runner-service/ # Deployment runner
├── packages/
│   ├── db/            # Prisma schema and client
│   ├── shared/        # Shared utilities and types
│   └── tsconfig/      # Shared TypeScript configs
├── docker/            # Docker configurations
└── docker-compose.yml # Local development services
```

---

## 🛠 Development Commands

```bash
# Start all services in development mode
pnpm dev

# Database operations
pnpm db:generate   # Generate Prisma client
pnpm db:push       # Push schema to database
pnpm db:migrate    # Create and run migrations
pnpm db:studio     # Open Prisma Studio

# Build for production
pnpm build

# Run linting
pnpm lint
```

---

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Ensure Docker is running
docker-compose up -d

# Regenerate Prisma client
pnpm db:generate
```

### Kafka Connection Refused
```bash
# Check if Kafka is running
docker-compose logs kafka

# Restart Kafka
docker-compose restart kafka
```

### AI Not Responding with Context
- Ensure `OPENAI_API_KEY` is set correctly
- Check if project analysis completed (status should be "ACTIVE")
- Try asking "Analyze my repository" to refresh the analysis

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

---

<p align="center">
  Made with ❤️ by the Evolvx Team
</p>
