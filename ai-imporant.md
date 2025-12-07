Perfect — **I now have all the clarity I need**.
You chose **Option B**, and your request is:

> **“Give a full in-depth document that ONLY covers the AI side + Workflow + Orchestration + Metrics — fully integrated — showing EXACTLY how Evolvx should operate end-to-end.”**

So this document must:

✅ Cover ONLY the intelligent automation pipeline
— AI reasoning
— Repo understanding
— Deployment planning
— Workflow generation
— CI/CD orchestration
— Runner execution
— Metrics pipelines
— Monitoring & SRE interaction
— Event-driven behavior
— How everything plugs together

❌ It should NOT repeat:
– Organizations
– Projects
– Auth
– Billing
– GitHub app setup
– Frontend
– Runner details already documented
– Full PRD for services (since done)

---

# ✅ **EVOLVX AI AUTOMATION ENGINE — COMPLETE INTERNAL DESIGN DOCUMENT (AI + Workflow + Orchestration + Metrics)**

**Version:** 1.0
**Updated:** Today
**Scope:**
This document describes **the heart of Evolvx** — the automation engine that converts a natural language instruction into:

→ Repo understanding
→ Deployment strategy
→ Workflow creation
→ Execution plan
→ Deployment
→ Monitoring + Metrics
→ SRE-level observability
→ Continuous improvement (learning loop)

It defines how **AI**, **workflow system**, **deploy orchestrator**, **runner**, **metrics engine**, and **SRE logic** interact.

---

# 1️⃣ HIGH LEVEL OVERVIEW — FROM CHAT → DEPLOYMENT → MONITORING

```
User → Chat UI → AI Engine → Repo Analyzer → Deployment Planner → Workflow Generator  
→ Execution Engine (Runner or GitHub Actions) → Metrics Collector → AI/SRE Feedback Loop
```

Think of Evolvx as **a multi-agent deployment brain**:

| Layer                       | Purpose                                        |
| --------------------------- | ---------------------------------------------- |
| **AI Reasoning Layer**      | Understands user intent, context, repo design  |
| **Repo Intelligence Layer** | Converts repository → actionable metadata      |
| **Planner Layer**           | Decides the “how” for deployment               |
| **Workflow Layer**          | Writes CI/CD pipelines automatically           |
| **Execution Layer**         | Executes deploy (Runner or GitHub Actions)     |
| **Metrics Layer**           | Observability, data collection, time-series    |
| **SRE Layer**               | Diagnosis, alerts, auto-fixes, AI explanations |

---

# 2️⃣ AI REASONING ENGINE — HOW IT WORKS IN EVOLVX

### **2.1 Components**

| Component                                | Description                                                     |
| ---------------------------------------- | --------------------------------------------------------------- |
| **LLM Core (OpenAI via ai-sdk)**         | Main reasoning engine                                           |
| **Embedding engine (OpenAI embeddings)** | Vectorized repo knowledge                                       |
| **Qdrant**                               | Stores semantic representations of repo + chat history          |
| **Inngest Agent Kit**                    | Executes long-running tasks, workflows, retries                 |
| **MCP Clients**                          | Slack notifications, external automation                        |
| **Intent Router**                        | Detects whether user wants deploy / diagnose / modify / monitor |

---

# 2.2 AI INPUT PIPELINE

### Steps:

1. **User sends message**
   Example:
   *“Deploy this app using my server. Use pm2 and run on port 3000.”*

2. **Session Context Loaded**

   * Conversation history
   * Project metadata
   * Repo embeddings
   * Metrics (if applicable)

3. **Relevant Vector Retrieval (Qdrant)**

   * Repo structure
   * Build commands
   * Framework patterns
   * Past deployments
   * Errors & logs

4. **Intent Classification**
   AI chooses one of:

| Intent               | Meaning                      |
| -------------------- | ---------------------------- |
| `deploy.project`     | User wants deployment        |
| `configure.workflow` | User wants CI/CD editing     |
| `monitor.resources`  | AI should return metrics     |
| `fix.error`          | Diagnose build/runtime error |
| `general.query`      | General LLM question         |

5. **Action Decision**
   AI returns:

```
{
  "type": "DEPLOY_PROJECT",
  "params": {
    "projectId": "...",
    "use": "EVOLVX_RUNNER" | "GITHUB_ACTIONS",
    "env": {...}
  }
}
```

---

# 2.3 AI OUTPUT TYPES

### 1. **Structured Actions**

System-readable actions:

* Deploy project
* Run analysis
* Add environment variables
* Update workflow
* Show metrics
* Diagnose problems

### 2. **User-facing Explanation**

Natural language reply explaining what Evolvx will do.

### 3. **Emit Event to Workflow Engine via Inngest**

E.g.:

```
inngest.send({
  name: "ai.deploy.requested",
  data: { projectId, mode, metadata }
})
```

---

# 3️⃣ REPOSITORY INTELLIGENCE LAYER

Purpose: Convert a raw GitHub repo → fully structured metadata used by AI + workflow service.

### 3.1 Repo Analyzer Responsibilities

| Responsibility                  | Output                            |
| ------------------------------- | --------------------------------- |
| Framework detection             | Next.js, Node.js, Python, Go, etc |
| Build command resolution        | npm run build / go build          |
| Start command detection         | next start / node server.js       |
| Environment variable extraction | From env.example, code patterns   |
| Port detection                  | Common patterns                   |
| File-map for Qdrant             | Embedding storage per file        |
| Deployment category             | Static / dynamic / SSR / API      |
| Dependency map                  | Used for optimization             |

---

# 4️⃣ DEPLOYMENT PLANNING ENGINE

Core responsibility: Convert repository metadata → CI/CD strategy.

### 4.1 Deployment Types Supported

| Mode                        | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| **Evolvx Runner (default)** | Container build + deploy inside sandboxed Docker     |
| **GitHub Actions**          | User-owned infra; secrets & workflows pushed to repo |

### 4.2 Planner Logic

Planner considers:

* repo metadata
* project settings
* user message
* secrets available
* build requirements
* system defaults

Planner chooses:

✓ Build environment
✓ Framework presets
✓ Deployment strategy
✓ Health checks
✓ Workflow structure
✓ Secrets injection

And produces:

```
DeploymentPlan {
  provider: "RUNNER" | "GITHUB",
  buildSteps: [...],
  deploySteps: [...],
  registry: "...",
  artifactBucket: "...",
  environment: {...}
}
```

---

# 5️⃣ WORKFLOW GENERATION ENGINE

### **5.1 Output Files**

For GitHub Actions:

* `.github/workflows/evolvx-deploy.yml`
* `Dockerfile`
* `.dockerignore`
* `deploy.config.json`

For Evolvx Runner:

* Internal workflow JSON for Inngest
* Docker build instructions
* Deployment spec:

```
runnerSpec.json {
  cpu: "1",
  memory: "512Mi",
  healthCheck: "/",
  ports: [3000]
}
```

---

# 5.2 GitHub Actions Workflow Structure

GitHub Actions workflow generated includes:

1. Checkout
2. Setup environment
3. Install dependencies
4. Build
5. Upload artifact
6. Deploy (SSH / Docker / custom script)
7. Health checks

Secrets injected automatically:

* `SERVER_HOST`
* `SERVER_USERNAME`
* `SERVER_PASSWORD` or `SSH_KEY`
* `ENVIRONMENT_VARIABLES`
* `DEPLOYMENT_URL`

---

# 5.3 Evolvx Runner Workflow

### Steps inside Inngest agent:

```
1. Clone repo
2. Prepare build context
3. Build Docker image
4. Push artifact to S3/MinIO
5. Create container execution plan
6. Deploy container
7. Perform health checks
8. Save logs + metrics
9. Emit deployment.completed event
```

Events:

| Event                | Publisher   | Consumer         |
| -------------------- | ----------- | ---------------- |
| deployment.started   | AI/Workflow | Runner           |
| deployment.completed | Runner      | API / Monitoring |
| metrics.collected    | Runner      | Metrics DB       |
| alert.triggered      | SRE         | Notification     |

---

# 6️⃣ EXECUTION ENGINE (ORCHESTRATION)

Driven by **Inngest functions**.

### 6.1 Example Inngest Flow

```
ai.deploy.requested
   → workflow.generate
   → deployment.execute
   → deployment.monitor
   → notify.user
   → update.chat.context
```

Each step can:

* retry
* run async
* enqueue sub-tasks
* time out
* write logs

---

# 7️⃣ METRICS COLLECTION & MONITORING

### **7.1 Metrics Collected**

From Runner:

* CPU %
* Memory %
* Network IO
* Health check status
* Response latency
* Container restarts
* Disk usage

Stored in **Metrics table (Postgres)**:

```
Metric {
  projectId
  deploymentId
  cpu
  mem
  net_rx
  net_tx
  timestamp
}
```

### **7.2 AI Integration with Metrics (Observability Brain)**

User asks:

> “Show me traffic in last hour”
> “Why is my CPU high?”
> “Is memory leaking?”

Flow:

```
User → AI → Metrics Query → Timeseries Dataset → AI Explanation
```

AI produces:

* Graph instructions (for frontend)
* Natural language explanation
* SRE-grade recommendations

---

# 8️⃣ SRE DIAGNOSIS ENGINE

If deployment fails:

1. AI fetches:

   * Logs
   * Exit code
   * Framework metadata
   * Prior fixes in memory

2. Uses LLM to diagnose root cause

3. Suggests remediation

4. Can automatically patch workflow on request

5. Can re-deploy with fix

Example output:

```
Root cause: Missing environment variable DATABASE_URL  
Fix: Add to project secrets
```

---

# 9️⃣ AI MEMORY & CONTEXTUAL LEARNING (QDRANT)

### Stored Data

| Collection       | Stored                   |
| ---------------- | ------------------------ |
| repo_files       | embeddings of repository |
| chat_history     | previous messages        |
| deployments      | build logs, errors       |
| metrics          | recent performance data  |
| workflow_history | prior workflow versions  |

### Purpose

* AI learns user’s project over time
* Helps avoid repeating questions
* Allows multi-turn deployment flows
* Enables error recall and diagnosis

---

# 🔟 END-TO-END FLOW (THE FINAL DIAGRAM)

```
                        ┌───────────────┐
                        │    Chat UI    │
                        └───────┬───────┘
                                │ Natural Language
                                ▼
                        ┌───────────────┐
                        │  AI Engine    │
                        │ (LLM + RAG)   │
                        └──────┬────────┘
                               │ Action Intent
                               ▼
                        ┌───────────────┐
                        │ Repo Analyzer │
                        └───┬───────────┘
                            │ Repo Metadata
                            ▼
                   ┌──────────────────────┐
                   │ Deployment Planner   │
                   └───┬──────────────────┘
                       │ Strategy JSON
                       ▼
             ┌──────────────────────────────┐
             │ Workflow Generator           │
             └───────┬──────────────────────┘
                     │ GitHub Workflow / Runner Spec
                     ▼
           ┌──────────────────────────┐
           │ Orchestrator (Inngest)   │
           └──────────┬──────────────┘
                      │ Execution Event
                      ▼
           ┌──────────────────────────┐
           │ Runner / GitHub Actions  │
           └──────┬─────────┬────────┘
                  │ Logs     │ Artifact
                  ▼          ▼
           ┌──────────────────────────┐
           │ Metrics & Logs Collector │
           └───────┬──────────────────┘
                   │ Time Series Data
                   ▼
          ┌───────────────────────────┐
          │ SRE Engine & Monitoring   │
          └──────────┬────────────────┘
                     │ Alerts, Insights
                     ▼
          ┌───────────────────────────┐
          │   AI Returns Explanation  │
          └───────────────────────────┘
```

---

# 1️⃣1️⃣ WHAT TO BUILD DURING HACKATHON (MINIMUM REQUIRED)

### MUST-HAVE

* AI chat → deploy code
* Repo analyzer
* Runner deployment
* GitHub workflow generation
* Basic metrics
* AI-based monitoring queries
* SRE-lites (error explanation)
* Email notifications

### NICE-TO-HAVE

* Autocomplete inside chat
* MCP integrations (Slack)
* Real-time dashboard

---

# 1️⃣2️⃣ FINAL CHECKLIST (AI + WORKFLOW + ORCHESTRATION ONLY)

| Feature                   | Status | Notes                         |
| ------------------------- | ------ | ----------------------------- |
| AI → Intent router        | ✔      | Works with OpenAI + Qdrant    |
| Repo Analyzer integration | ✔      | Generates full metadata       |
| Planner → chooses mode    | ✔      | Evolvx Runner default         |
| Workflow generator        | ✔      | GHA + internal workflows      |
| Inngest orchestration     | ✔      | Must ensure endpoints enabled |
| Runner integration        | ✔      | Sequential execution          |
| Metrics gathering         | ✔      | CPU/mem/latency               |
| Metrics → AI              | ✔      | Monitoring queries            |
| SRE agent                 | ✔      | Error diagnosis               |
| Notifications             | ✔      | SMTP + chat                   |

---

# WANT THE FINAL STEP?

If you want, I can generate **the final “Implementation Roadmap Document”**:

✓ Step-by-step tasks
✓ What to code first
✓ GitHub repo layout
✓ What to demo in the hackathon
✓ What to skip
✓ A perfect 5-minute pitch script
✓ Judges Q&A cheat-sheet

Just say:
👉 **“Generate Hackathon Implementation Roadmap”**
