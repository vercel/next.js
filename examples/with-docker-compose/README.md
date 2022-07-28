# With Docker Compose

This example contains everything needed to get a Next.js development and production environment up and running with Docker Compose.

## Benfits of Docker Compose

- Develop locally without Node.js or TypeScript installed ✨
- Easy to run, consistent development environment across Mac, Windows, and Linux teams
- Run multiple Next.js apps, databases, and other microservices in a single deployment
- Multistage builds combined with [Output Standalone](https://nextjs.org/docs/advanced-features/output-file-tracing#automatically-copying-traced-files-experimental) outputs up to 85% smaller apps (Approximately 110 MB compared to 1 GB with create-next-app)
- BuildKit engine builds multiple Docker images in parallel
- Easy configuration with YAML files

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-docker-compose with-docker-compose-app
```

```bash
yarn create next-app --example with-docker-compose with-docker-compose-app
```

```bash
pnpm create next-app --example with-docker-compose with-docker-compose-app
```

## Prerequisites

Install [Docker Desktop](https://docs.docker.com/get-docker) for Mac, Windows, or Linux. Docker Desktop includes Docker Compose as part of the installation.

## Development

First, run the development server:

```bash
# Create a network, which allows containers to communicate
# with each other, by using their container name as a hostname
docker network create my_network

# Build dev using new BuildKit engine
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose -f docker-compose.dev.yml build --parallel

# Up dev
docker-compose -f docker-compose.dev.yml up
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

## Production

Multistage builds are highly recommended in production. Combined with the Next 12 [Output Standalone](https://nextjs.org/docs/advanced-features/output-file-tracing#automatically-copying-traced-files-experimental) feature, only `node_modules` files required for production are copied into the final Docker image.

First, run the production server (Final image approximately 110 MB).

```bash
# Create a network, which allows containers to communicate
# with each other, by using their container name as a hostname
docker network create my_network

# Build prod using new BuildKit engine
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose -f docker-compose.prod.yml build --parallel

# Up prod in detached mode
docker-compose -f docker-compose.prod.yml up -d
```

Alternatively, run the production server without without multistage builds (Final image approximately 1 GB).

```bash
# Create a network, which allows containers to communicate
# with each other, by using their container name as a hostname
docker network create my_network

# Build prod without multistage using new BuildKit engine
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose -f docker-compose.prod-without-multistage.yml build --parallel

# Up prod without multistage in detached mode
docker-compose -f docker-compose.prod-without-multistage.yml up -d
```

Open [http://localhost:3000](http://localhost:3000).

## Useful commands

```bash
# Stop all running containers
docker kill $(docker ps -q) && docker rm $(docker ps -a -q)

# Free space
docker system prune -af --volumes
```
