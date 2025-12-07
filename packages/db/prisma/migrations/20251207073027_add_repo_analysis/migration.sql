-- CreateTable
CREATE TABLE "repo_analyses" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "repository_name" TEXT NOT NULL,
    "repository_full_name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "branch" TEXT DEFAULT 'main',
    "framework" TEXT,
    "language" TEXT,
    "build_tool" TEXT,
    "package_manager" TEXT,
    "has_dockerfile" BOOLEAN NOT NULL DEFAULT false,
    "has_ci_config" BOOLEAN NOT NULL DEFAULT false,
    "dependencies" JSONB,
    "structure" JSONB,
    "infrastructure" JSONB,
    "environment" JSONB,
    "deployment" JSONB,
    "ai_summary" TEXT,
    "code_quality" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "repo_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repo_analyses_project_id_idx" ON "repo_analyses"("project_id");

-- CreateIndex
CREATE INDEX "repo_analyses_repository_full_name_idx" ON "repo_analyses"("repository_full_name");

-- CreateIndex
CREATE INDEX "repo_analyses_status_idx" ON "repo_analyses"("status");

-- AddForeignKey
ALTER TABLE "repo_analyses" ADD CONSTRAINT "repo_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
