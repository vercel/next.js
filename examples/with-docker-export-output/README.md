# Next.js Docker Example

A production-ready example demonstrating how to Dockerize Next.js applications using **static export** mode. This example showcases two different approaches for serving static Next.js sites: **Nginx** and **serve** package.

## Features

- ✅ Multi-stage Docker build for optimal image size
- ✅ Static export: Fully static HTML/CSS/JavaScript site
- ✅ Two serving options: Nginx (production-grade) and serve (simple Node.js server)
- ✅ Security best practices (non-root user)
- ✅ Slim/Alpine Linux base images for optimal compatibility and smaller size
- ✅ BuildKit cache mounts for faster builds
- ✅ Production-ready configuration with optimized Nginx settings
- ✅ Docker Compose support for easy deployment

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Node.js 20+](https://nodejs.org/) (for local development)

## Quick Start with Docker

### Option 1: Using Nginx (Recommended for Production)

**Nginx** is ideal when you need:

- Production-grade web server
- Maximum performance and efficiency
- Advanced caching and compression
- Smaller Docker images (~50MB)
- Industry-standard web server

#### Using Docker Compose

```bash
docker compose up nextjs-static-export --build
```

**Access:** [http://localhost:8080](http://localhost:8080)

#### Using Docker Build

```bash
docker build -t nextjs-static-export .
docker run -p 8080:8080 nextjs-static-export
```

**Access:** [http://localhost:8080](http://localhost:8080)

### Option 2: Using serve Package

**serve** is ideal when you need:

- Simple Node.js-based static file server
- Quick development/testing deployments
- Familiar Node.js ecosystem
- Easy customization

#### Using Docker Compose

```bash
# OR run with serve npm package
docker compose up nextjs-static-export-with-serve --build
```

**Access:** [http://localhost:3000](http://localhost:3000)

#### Using Docker Build

```bash
docker build -t nextjs-static-export-serve -f Dockerfile.serve .
docker run -p 3000:3000 nextjs-static-export-serve
```

**Access:** [http://localhost:3000](http://localhost:3000)

## Project Structure

```
nextjs-docker/
├── app/                    # Next.js App Router directory
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx            # Home page with example content
│   └── globals.css         # Global styles with Tailwind CSS v4
├── public/                 # Static assets
│   └── next.svg           # Next.js logo
├── Dockerfile              # Nginx-based Dockerfile (port 8080)
├── Dockerfile.serve        # serve-based Dockerfile (port 3000)
├── compose.yml             # Docker Compose with both services
├── nginx.conf              # Nginx configuration for static export
├── next.config.ts          # Next.js configuration (static export mode)
├── postcss.config.js       # PostCSS configuration for Tailwind CSS
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies and scripts
└── README.md              # This file
```

## Configuration

### Next.js Static Export Mode

The `next.config.ts` file is configured with `output: "export"`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true, // Required for static export
  },
};

export default nextConfig;
```

**Static export mode** generates a fully static HTML/CSS/JavaScript site that can be served by any static hosting service or web server. When enabled, Next.js generates an `out` directory containing all static files. This results in:

- Smaller Docker image (~80MB with Nginx, ~350MB with serve)
- Faster deployments (no Node.js runtime needed for Nginx)
- Better CDN compatibility (pure static files)
- Lower resource usage (Nginx uses minimal memory)

**Note:** Static export has limitations:

- No server-side rendering (SSR)
- No API routes
- Images must be unoptimized or use external image optimization

Learn more about [Next.js static export](https://nextjs.org/docs/app/api-reference/next-config-js/output#static-export) in the official documentation.

### Dockerfile Highlights

#### Nginx-based (`Dockerfile`)

- **Multi-stage build**: Separates dependency installation (`dependencies`), build (`builder`), and runtime (`runner`) stages
- **Nginx server**: Uses `nginxinc/nginx-unprivileged:alpine3.22` for serving static files (~50MB final image)
- **BuildKit cache mounts**: Speeds up builds by caching package manager stores and Next.js build cache
- **Non-root user**: Runs as `nginx` user for security
- **Production Nginx config**: Optimized with gzip compression, caching headers, and security best practices
- **Port**: 8080

#### serve-based (`Dockerfile.serve`)

- **Multi-stage build**: Separates dependency installation (`dependencies`), build (`builder`), and runtime (`runner`) stages
- **Node.js runtime**: Uses `node:24.13.0-slim` for running serve package
- **serve package**: Uses `serve@14.2.5` for serving static files
- **BuildKit cache mounts**: Speeds up builds by caching package manager stores and Next.js build cache
- **Non-root user**: Runs as `node` user for security
- **SPA mode**: Configured with single-page application support
- **Port**: 3000

**Node.js version maintenance**: Uses Node.js 24.13.0-slim (latest LTS at time of writing). Update the `NODE_VERSION` ARG to the latest LTS version for security updates.

**Nginx image maintenance**: Uses `nginxinc/nginx-unprivileged:alpine3.22`. Update the `NGINXINC_IMAGE_TAG` ARG to the latest version for security updates.

**Why Node.js slim image tag?**: The slim variant provides optimal compatibility with npm packages and native dependencies while maintaining a smaller image size (~226MB). Slim uses glibc (standard Linux), ensuring better compatibility than Alpine's musl libc, which can cause issues with some npm packages. This makes it ideal for public examples where reliability and compatibility are priorities.

**When to use Alpine?**: Consider using `node:24.11.1-alpine` instead if:

- **Image size is critical**: Alpine images are typically ~100MB smaller than slim variants (~110MB base vs ~226MB)
- **Your dependencies are compatible**: Your npm packages don't require native binaries that depend on glibc
- **You've tested thoroughly**: You've verified all your dependencies work correctly with musl libc
- **Security-focused deployments**: Alpine's minimal attack surface can be beneficial for security-sensitive applications

To switch to Alpine, simply change the `NODE_VERSION` ARG in the Dockerfile to `24.11.1-alpine`.

**⚠️ Important - Version Maintenance**:

- **Node.js**: This Dockerfile uses Node.js 24.13.0-slim, which was the latest LTS version at the time of writing. To ensure security and stay up-to-date, regularly check and update the `NODE_VERSION` ARG in the Dockerfile to the latest Node.js LTS version. Check the latest version at [Node.js official website](https://nodejs.org/) and browse available Node.js images on [Docker Hub](https://hub.docker.com/_/node).

- **Nginx**: The Nginx Dockerfile uses `nginxinc/nginx-unprivileged:alpine3.22`. Regularly check and update the `NGINXINC_IMAGE_TAG` ARG to the latest version. Browse available Nginx images on [Docker Hub](https://hub.docker.com/r/nginxinc/nginx-unprivileged).

- **serve package**: The serve Dockerfile uses `serve@14.2.5`. Update to the latest version as needed for bug fixes and features.

### Package Manager Support

Both Dockerfiles support multiple package managers:

- **npm** (via `package-lock.json`)
- **yarn** (via `yarn.lock`)
- **pnpm** (via `pnpm-lock.yaml`)

The Dockerfiles automatically detect which lockfile is present and use the appropriate package manager.

## Deployment

This example can be deployed to any container-based platform:

- Google Cloud Run
- AWS ECS/Fargate
- Azure Container Instances
- DigitalOcean App Platform
- Any Kubernetes cluster
- Vercel (for static export)

### Choosing Between Nginx and serve

**Use Nginx (`Dockerfile`)** when:

- Deploying to production
- Maximum performance is required
- You need advanced caching and compression
- Image size is a concern (~50MB vs ~300MB)
- You want industry-standard web server

**Use serve (`Dockerfile.serve`)** when:

- Quick development/testing deployments
- You prefer Node.js ecosystem
- You need easy customization
- Image size is not a concern

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - Comprehensive Next.js documentation
- [Next.js Templates](https://vercel.com/templates?framework=next.js) - Browse and deploy Next.js templates
- [Next.js Examples](https://github.com/vercel/next.js/tree/canary/examples) - Discover boilerplate example projects
- [Deploy to Vercel](https://vercel.com/new) - Instantly deploy your Next.js site
- [Learn Docker](https://docs.docker.com/get-started/) - Get started with Docker fundamentals, containerization, and deployment
- [Docker Documentation](https://docs.docker.com/) - Comprehensive Docker documentation and reference guides
- [React.js Docker Guide](https://docs.docker.com/language/nodejs/) - Official Docker guide for React.js applications following best practices for containerization
