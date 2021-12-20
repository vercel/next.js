# With Docker Compose

This example contains everything needed to get a multi-Next.js app development and production environment up and running with Docker Compose. Includes example JavaScript and TypeScript apps.

## Benfits of Docker Compose

- Develop locally without Node.js or TypeScript installed ✨
- Easy to run, consistent development environment across Windows, MacOS, and Linux teams
- Run multiple Next.js apps, databases, and other microservices in a single deployment
- Multistage builds combined with [Output Standalone](https://nextjs.org/docs/advanced-features/output-file-tracing#automatically-copying-traced-files-experimental) for up to [85% smaller apps](#production) (Approximately 110 MB compared to 1 GB with create-next-app)
- BuildKit engine builds multiple Docker images in parallel
- Easy configuration with YAML files

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-docker-compose with-docker-compose-app
# or
yarn create next-app --example with-docker-compose with-docker-compose-app
```

## Prerequisites

- On Windows and MacOS, install [Docker Desktop](https://docs.docker.com/get-docker). Docker Desktop includes Docker Compose as part of the installation.
- On Linux, run:

```bash
# Install Docker and Docker Compose for Linux
wget -O - https://gist.githubusercontent.com/wdullaer/f1af16bd7e970389bad3/raw/install.sh | bash
```

## Development

1. Run the development server:

```bash
./dev.sh
```

2. Open [http://localhost:3000](http://localhost:3000) to visit Next.js JavaScript app.
3. Open [http://localhost:3002](http://localhost:3002) to visit Next.js TypeScript app.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

## Production

Multistage builds are highly recommended in production. Combined with the experimental Next 12 [Output Standalone](https://nextjs.org/docs/advanced-features/output-file-tracing#automatically-copying-traced-files-experimental) feature, only `node_modules` files required for production are copied into the final Docker image.

1. Run the production server:

```bash
# Final image approximately 110 MB
./prod.sh

# Final image approximately 1 GB :-(
./prod-without-multistage.sh
```

2. Open [http://localhost:3000](http://localhost:3000) to visit Next.js JavaScript app.
3. Open [http://localhost:3002](http://localhost:3002) to visit Next.js TypeScript app.

## Useful commands

```
# Stop any running containers
docker kill $(docker ps -q) && docker rm $(docker ps -a -q)

# Free space
docker system prune -af --volumes
```
