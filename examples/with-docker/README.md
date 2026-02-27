# Next.js Docker Example - Standalone Mode

A production-ready example demonstrating how to Dockerize Next.js applications using **standalone mode**. This example showcases best practices for containerizing Next.js apps with Docker.

## Features

- Multi-stage Docker build for optimal image size
- Next.js standalone mode for minimal production builds
- Security best practices (non-root user)
- Slim Linux base image for optimal compatibility and smaller size
- BuildKit cache mounts for faster builds
- Production-ready configuration

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Node.js 20+](https://nodejs.org/)

## Quick Start with Docker

### Using Docker Compose

The `compose.yml` includes both Node.js and Bun configurations. Run one service at a time to avoid port conflicts.

**Node.js:**

```bash
# Run with Node.js
docker compose up nextjs-standalone --build
```

**Bun:**

```bash
# OR run with Bun
docker compose up nextjs-standalone-with-bun --build
```

**Stop the application:**

```bash
docker compose down
```

### Using Docker Build

**Node.js:**

```bash
# Build the image
docker build -t nextjs-standalone-image .

# Run the container
docker run -p 3000:3000 nextjs-standalone-image
```

**Bun:**

```bash
# Build the image
docker build -f Dockerfile.bun -t nextjs-standalone-bun-image .

# Run the container
docker run -p 3000:3000 nextjs-standalone-bun-image
```

**Open your browser:** Navigate to [http://localhost:3000](http://localhost:3000)

### In existing projects

To add Docker support to your existing Next.js project:

1. Copy the [`Dockerfile`](https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile) (or [`Dockerfile.bun`](https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile.bun) for Bun) to your project root.
2. Copy the [`.dockerignore`](https://github.com/vercel/next.js/blob/canary/examples/with-docker/.dockerignore) to your project root.
3. Add the following to your `next.config.js` (or `next.config.ts`):

```js
// next.config.js
module.exports = {
  output: "standalone",
};
```

This will build the project as a standalone app inside the Docker image.

## Project Structure

```
nextjs-docker/
├── app/                    # Next.js App Router directory
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx            # Home page with example content
│   └── globals.css         # Global styles with Tailwind CSS v4
├── public/                 # Static assets
│   └── next.svg            # Next.js logo
├── Dockerfile              # Multi-stage Docker configuration (Node.js)
├── Dockerfile.bun          # Multi-stage Docker configuration (Bun)
├── compose.yml             # Docker Compose configuration (Node.js & Bun services)
├── next.config.ts          # Next.js configuration (standalone mode)
├── postcss.config.js       # PostCSS configuration for Tailwind CSS
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies and scripts
└── README.md               # This file
```

## Configuration

### Next.js Standalone Mode

The `next.config.ts` file is configured with `output: "standalone"`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

The standalone output mode creates a minimal, self-contained production build optimized for containerized deployments. When enabled, Next.js generates a `.next/standalone` directory containing only the essential files needed to run your application, excluding unnecessary dependencies and files. This results in significantly smaller Docker images and faster container startup times.

Learn more about [Next.js standalone output](https://nextjs.org/docs/pages/api-reference/next-config-js/output#standalone) in the official documentation.

### Dockerfile Highlights (Node.js)

- **Multi-stage build**: Separates dependency installation (`dependencies`), build (`builder`), and runtime (`runner`) stages
- **Slim Linux**: Uses `slim` image tag for optimal compatibility and smaller image size
- **BuildKit cache mounts**: Speeds up builds by caching package manager stores (`/root/.npm`, `/usr/local/share/.cache/yarn`, `/root/.local/share/pnpm/store`). See the Dockerfile for an optional `.next/cache` mount to speed up rebuilds.
- **Non-root user**: Runs as `node` user for security
- **Optimized layers**: Leverages Docker layer caching effectively
- **Standalone output**: Copies only the necessary files from `.next/standalone` and `.next/static`
- **Writable `.next` directory**: The `.next` directory is created and owned by the `node` user so the server can write prerender cache and optimized images at runtime
- **Node.js version maintenance**: Uses Node.js 24.13.0-slim (latest LTS at time of writing). Update the `NODE_VERSION` ARG to the latest LTS version for security updates.

### Dockerfile.bun Highlights (Bun)

- **Multi-stage build**: Same three-stage pattern optimized for Bun
- **Official Bun image**: Uses `oven/bun:1` for optimal Bun performance
- **Non-root user**: Runs as built-in `bun` user for security
- **Frozen lockfile**: Uses `bun.lock` for reproducible builds
- **Standalone output**: Same optimized output as the Node.js version, with writable `.next` directory for runtime cache

**Why Node.js slim image tag?**: The slim variant provides optimal compatibility with npm packages and native dependencies while maintaining a smaller image size (~226MB). Slim uses glibc (standard Linux), ensuring better compatibility than Alpine's musl libc, which can cause issues with some npm packages. This makes it ideal for public examples where reliability and compatibility are priorities.

**When to use Alpine?**: Consider using `node:24.11.1-alpine` instead if:

- **Image size is critical**: Alpine images are typically ~100MB smaller than slim variants (~110MB base vs ~226MB)
- **Your dependencies are compatible**: Your npm packages don't require native binaries that depend on glibc
- **You've tested thoroughly**: You've verified all your dependencies work correctly with musl libc
- **Security-focused deployments**: Alpine's minimal attack surface can be beneficial for security-sensitive applications

To switch to Alpine, simply change the `NODE_VERSION` ARG in the Dockerfile to `24.11.1-alpine`.

> [!IMPORTANT]
> **Node.js Version Maintenance**: This Dockerfile uses Node.js 24.13.0-slim, which was the latest LTS version at the time of writing. To ensure security and stay up-to-date, regularly check and update the `NODE_VERSION` ARG in the Dockerfile to the latest Node.js LTS version. Check the latest version at [Nodejs official website](https://nodejs.org/) and browse available Node.js images on [Docker Hub](https://hub.docker.com/_/node).

## Deployment

This example can be deployed to any container-based platform:

- Google Cloud Run
- AWS ECS/Fargate
- Azure Container Instances
- DigitalOcean App Platform
- Any Kubernetes cluster

### Deploying to Google Cloud Run

1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) so you can use `gcloud` on the command line.
2. Run `gcloud auth login` to log in to your account.
3. [Create a new project](https://cloud.google.com/run/docs/quickstarts/build-and-deploy) in Google Cloud Run (e.g. `nextjs-docker`). Ensure billing is turned on.
4. Build your container image using Cloud Build:
   ```bash
   gcloud builds submit --tag gcr.io/PROJECT-ID/nextjs-docker --project PROJECT-ID
   ```
   This will also enable Cloud Build for your project.
5. Deploy to Cloud Run:

   ```bash
   gcloud run deploy --image gcr.io/PROJECT-ID/nextjs-docker --project PROJECT-ID --platform managed --allow-unauthenticated
   ```

   - You will be prompted for the service name: press Enter to accept the default name, `nextjs-docker`.
   - You will be prompted for [region](https://cloud.google.com/run/docs/quickstarts/build-and-deploy#follow-cloud-run): select the region of your choice, for example `us-central1`.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - Comprehensive Next.js documentation
- [Next.js Templates](https://vercel.com/templates?framework=next.js) - Browse and deploy Next.js templates
- [Next.js Examples](https://github.com/vercel/next.js/tree/canary/examples) - Discover boilerplate example projects
- [Deploy to Vercel](https://vercel.com/new) - Instantly deploy your Next.js site
- [Learn Docker](https://docs.docker.com/get-started/) - Get started with Docker fundamentals, containerization, and deployment
- [Docker Documentation](https://docs.docker.com/) - Comprehensive Docker documentation and reference guides
- [React.js Docker Guide](https://docs.docker.com/language/nodejs/) - Official Docker guide for React.js applications following best practices for containerization
