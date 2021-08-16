# Temporal Next.js example

[Temporal](https://temporal.io/) is a runtime for orchestrating microservices or serverless functions. TODO

## Deploy your own

### Web server

The web server and `pages/api/` serverless functions can be deployed using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-typescript&project-name=with-typescript&repository-name=with-typescript)

### Worker

One or more instances of the worker (`temporal/src/worker/`) can be deployed to a PaaS (each worker is a long-running Node process, so it can't run on FaaS/serverless).

### Temporal Server

Temporal Server is a cluster of internal services, a database of record, and a search database. It can be [deployed](https://docs.temporal.io/docs/server/production-deployment) with a container orchestration service like Kubernetes or ECS.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-temporal next-temporal-app
# or
yarn create next-app --example with-temporal next-temporal-app
```

The Temporal Node SDK requires [Node `>= 14`, `node-gyp`, and Temporal Server](https://docs.temporal.io/docs/node/getting-started#step-0-prerequisites). Once you have everything installed, you can develop locally with the below commands in four different shells:

In the Temporal Server docker directory:

```bash
docker-compose up
```

In the root Next.js directory:

```bash
npm run dev
```

```bash
npm run build-worker.watch
```

```bash
npm run start-worker
```
