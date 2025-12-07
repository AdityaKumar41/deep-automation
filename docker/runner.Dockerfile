# Runner Service Dockerfile  
FROM node:20-alpine AS base

# Install Docker CLI
RUN apk add --no-cache docker-cli

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/runner-service ./apps/runner-service

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm db:generate

# Build the runner service
RUN pnpm --filter @evolvx/runner-service build

# Production stage
FROM node:20-alpine AS production

RUN apk add --no-cache docker-cli
RUN npm install -g pnpm

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/runner-service ./apps/runner-service

EXPOSE 3002

CMD ["pnpm", "--filter", "@evolvx/runner-service", "start"]
