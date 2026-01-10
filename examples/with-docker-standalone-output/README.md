# Next.js Docker Example - Standalone Mode

A production-ready example demonstrating how to Dockerize Next.js applications using **standalone mode**. This example showcases best practices for containerizing Next.js apps with Docker.

## Features

- ✅ Multi-stage Docker build for optimal image size
- ✅ Next.js standalone mode for minimal production builds
- ✅ Security best practices (non-root user)
- ✅ Slim Linux base image for optimal compatibility and smaller size
- ✅ BuildKit cache mounts for faster builds
- ✅ Production-ready configuration

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Node.js 20+](https://nodejs.org/)

## Quick Start with Docker

### Using Docker Compose

1. Start the application:

   ```bash
   docker compose up
   ```

2. **Rebuild and start the application:**

   ```bash
   docker compose up -d --build
   ```

3. **Stop the application:**
   ```bash
   docker compose down
   ```

### Using Docker Build

1. **Build the Docker image:**

   ```bash
   docker build -t nextjs-docker .
   ```

2. **Run the container:**

   ```bash
   docker run -p 3000:3000 nextjs-docker
   ```

3. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
nextjs-docker/
├── app/                    # Next.js App Router directory
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx            # Home page with example content
│   └── globals.css         # Global styles with Tailwind CSS v4
├── public/                 # Static assets
│   └── next.svg           # Next.js logo
├── Dockerfile              # Multi-stage Docker configuration
├── compose.yml             # Docker Compose configuration
├── next.config.ts          # Next.js configuration (standalone mode)
├── postcss.config.js       # PostCSS configuration for Tailwind CSS
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies and scripts
└── README.md              # This file
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

### Dockerfile Highlights

- **Multi-stage build**: Separates dependency installation (`base`), build (`builder`), and runtime (`runner`) stages
- **Slim Linux**: Uses `slim` image tag for optimal compatibility and smaller image size
- **BuildKit cache mounts**: Speeds up builds by caching package manager stores (`/root/.npm`, `/usr/local/share/.cache/yarn`, `/root/.local/share/pnpm/store`) and Next.js build cache (`/app/.next/cache`)
- **Non-root user**: Runs as `node` user for security
- **Optimized layers**: Leverages Docker layer caching effectively
- **Standalone output**: Copies only the necessary files from `.next/standalone` and `.next/static`
- **Node.js version maintenance**: Uses Node.js 24.12.0-slim (latest LTS at time of writing). Update the `NODE_VERSION` ARG to the latest LTS version for security updates.

**Why Node.js slim image tag?**: The slim variant provides optimal compatibility with npm packages and native dependencies while maintaining a smaller image size (~226MB). Slim uses glibc (standard Linux), ensuring better compatibility than Alpine's musl libc, which can cause issues with some npm packages. This makes it ideal for public examples where reliability and compatibility are priorities.

**When to use Alpine?**: Consider using `node:24.11.1-alpine` instead if:

- **Image size is critical**: Alpine images are typically ~100MB smaller than slim variants (~110MB base vs ~226MB)
- **Your dependencies are compatible**: Your npm packages don't require native binaries that depend on glibc
- **You've tested thoroughly**: You've verified all your dependencies work correctly with musl libc
- **Security-focused deployments**: Alpine's minimal attack surface can be beneficial for security-sensitive applications

To switch to Alpine, simply change the `NODE_VERSION` ARG in the Dockerfile to `24.11.1-alpine`.

**⚠️ Important - Node.js Version Maintenance**: This Dockerfile uses Node.js 24.12.0-slim, which was the latest LTS version at the time of writing. To ensure security and stay up-to-date, regularly check and update the `NODE_VERSION` ARG in the Dockerfile to the latest Node.js LTS version. Check the latest version at [Nodejs official website](https://nodejs.org/) and browse available Node.js images on [Docker Hub](https://hub.docker.com/_/node).

## Deployment

This example can be deployed to any container-based platform:

- Google Cloud Run
- AWS ECS/Fargate
- Azure Container Instances
- DigitalOcean App Platform

- Any Kubernetes cluster

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - Comprehensive Next.js documentation
- [Next.js Templates](https://vercel.com/templates?framework=next.js) - Browse and deploy Next.js templates
- [Next.js Examples](https://github.com/vercel/next.js/tree/canary/examples) - Discover boilerplate example projects
- [Deploy to Vercel](https://vercel.com/new) - Instantly deploy your Next.js site
- [Learn Docker](https://docs.docker.com/get-started/) - Get started with Docker fundamentals, containerization, and deployment
- [Docker Documentation](https://docs.docker.com/) - Comprehensive Docker documentation and reference guides
- [React.js Docker Guide](https://docs.docker.com/language/nodejs/) - Official Docker guide for React.js applications following best practices for containerization
- [Front-end Production Dockerfiles](https://github.com/kristiyan-velkov/frontend-prod-dockerfiles) - Production-ready Dockerfiles for React.js, Angular, Vue.js, Next.js, Nuxt.js and more front-end applications.

## Author

**Kristiyan Velkov**

- [Website](https://kristiyanvelkov.com/)
- [LinkedIn](https://www.linkedin.com/in/kristiyan-velkov-763130b3/)
- [GitHub](https://github.com/kristiyan-velkov)
- [X (Twitter)](https://x.com/krisvelkov)

## License

This project is open source and available under the [MIT License](LICENSE).

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](../../issues).

---

Made with ❤️ by [Kristiyan Velkov](https://kristiyanvelkov.com/)