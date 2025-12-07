# Evolvx AI Automation Engine

An intelligent, AI-driven DevOps platform that automates deployment planning, workflow generation, and execution.

## 🏗 Architecture

- **Frontend**: Next.js 15 + Shadcn UI (`apps/web`)
- **Backend API**: Fastify + Prisma (`apps/api`)
- **Runner Service**: Fastify + Dockerode (`apps/runner-service`)
- **Database**: PostgreSQL (Prisma ORM)
- **Queue/Event Bus**: Apache Kafka + Inngest
- **Vector DB**: Qdrant (for AI RAG Memory)
- **AI**: OpenAI (Reasoning & Embeddings)

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20+
- **pnpm**: v8+ (`npm install -g pnpm`)
- **Docker**: For running infrastructure (Postgres, Kafka, Qdrant)
- **Inngest CLI**: For local event testing (`npm install -g inngest-cli`)

### 1. Environment Setup

Copy the example environment file:
```bash
cp .env.example .env
```
Fill in the required keys in `.env`:
- `DATABASE_URL`: `postgresql://postgres:postgres@localhost:5432/evolvx?schema=public`
- `OPENAI_API_KEY`: Your OpenAI key
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` & `CLERK_SECRET_KEY`: Clerk Auth
- `GITHUB_APP_xxx`: GitHub App credentials (optional for local dev, needed for repo analysis)

### 2. Start Infrastructure

Start the supporting services (Postgres, Kafka, Qdrant, Redis):
```bash
docker-compose up -d
```
*Wait a few seconds for Kafka and Postgres to initialize.*

### 3. Install Dependencies

In the root directory:
```bash
pnpm install
```

### 4. Database Setup

Generate Prisma client and push the schema:
```bash
pnpm db:generate
pnpm db:push
```
*(Or use `pnpm db:migrate` if you want to create migrations)*

### 5. Start Development Servers

Start all applications (Web, API, Runner) in parallel:
```bash
pnpm dev
```
This runs:
- **Web**: http://localhost:3000
- **API**: http://localhost:3001
- **Runner**: http://localhost:3002

### 6. Start Inngest Dev Server

In a **separate terminal**, run the Inngest local server to handle background events (Campaigns, Deployment Orchestration):
```bash
npx inngest-cli@latest dev -u http://localhost:3001/api/inngest
```
Open http://localhost:8288 to view the Inngest dashboard.

---

## 🧪 Testing the AI Flow

1. **Login**: Go to http://localhost:3000 and sign in (Clerk).
2. **Create Project**: Import a GitHub repo URL.
3. **Chat**: specific intent commands:
   - *"Deploy this project"* -> Triggers AI Planner -> Workflow Gen -> Execution.
   - *"Show me CPU usage"* -> Triggers Metrics Analysis.
   - *"Why did the build fail?"* -> Triggers SRE Diagnosis.

Data will flow through:
`AI Router` -> `Dispatcher` -> `Inngest Pipeline` -> `Runner Execution` -> `Qdrant RAG`.

---

## 🛠 Troubleshooting

- **Kafka Connection Refused**: Ensure `docker-compose` is running and port `9093` is open.
- **Prisma Errors**: Run `pnpm db:generate` again if you changed the schema.
- **Missing Deps**: Run `pnpm install` in the specific package folder if needed.
