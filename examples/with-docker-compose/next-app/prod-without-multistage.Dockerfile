FROM node:18-bookworm-slim AS base

# Step 1. Rebuild the source code only when needed
FROM base AS builder

# libc6-compat may be needed for Alpine-based images
# https://github.com/nodejs/docker-node/tree/main#nodealpine
# RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* bun.lockb* ./

RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i; \
  elif [ -f bun.lockb ]; then npm install -g bun && bun i; \
  # Allow install without lockfile, so example works even without Node.js installed locally
  else echo "Warning: Lockfile not found. It is recommended to commit lockfiles to version control." && yarn install; \
  fi

COPY src ./src
COPY public ./public
COPY next.config.js .
COPY tsconfig.json .

# Environment variables must be present at build time
# https://github.com/vercel/next.js/discussions/14030
ARG ENV_VARIABLE
ENV ENV_VARIABLE=${ENV_VARIABLE}
ARG NEXT_PUBLIC_ENV_VARIABLE
ENV NEXT_PUBLIC_ENV_VARIABLE=${NEXT_PUBLIC_ENV_VARIABLE}

# Next.js collects completely anonymous telemetry data about general usage. Learn more here: https://nextjs.org/telemetry
# Uncomment the following line to disable telemetry at build time
# ENV NEXT_TELEMETRY_DISABLED 1

# Required to deploy on Google Cloud Run
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Build Next.js based on the preferred package manager
RUN \
  if [ -f yarn.lock ]; then yarn build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then pnpm build; \
  elif [ -f bun.lockb ]; then bun run build; \
  else yarn build; \
  fi

# Don't run as root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

USER nextjs

# Start Next.js based on the preferred package manager
CMD \
  if [ -f yarn.lock ]; then yarn start; \
  elif [ -f package-lock.json ]; then npm run start; \
  elif [ -f pnpm-lock.yaml ]; then pnpm start; \
  elif [ -f bun.lockb ]; then bun start; \
  else yarn start; \
  fi
