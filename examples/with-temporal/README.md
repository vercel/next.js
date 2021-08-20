# Temporal Next.js example

> “Temporal does to backend and infra what React did to frontend. If you're in the React world, you've forgotten about manually adding and removing DOM elements, updating attributes and their quirks, hooking up event listeners… It's not only been a boost in developer experience, but most importantly in consistency and reliability. In the backend world, this reliability problem is absurdly amplified as monoliths break into SaaS services, functions, containers… You have to carefully manage and create queues to capture each side effect, ensure everything gets retried, state is scattered all over the place. Temporal's engine is quite complex, much like React's, but the surface exposed to the developer is a beautiful "render()" function to organize your backend workflows.”
> —[Guillermo Rauch](https://twitter.com/rauchg/status/1316808665370820609)

**Table of Contents**

- [Starter project](#starter-project)
- [Deploy your own](#deploy-your-own)
  - [Web server](#web-server)
  - [Worker](#worker)
  - [Temporal Server](#temporal-server)
- [How to use](#how-to-use)

## Starter project

This is a starter project for creating resilient Next.js applications with [Temporal](https://temporal.io/). Whenever our [API routes](https://nextjs.org/docs/api-routes/introduction) need to do any of the below, we can greatly increase our code's fault tolerance by using Temporal:

- Perform a series of network requests (to a database, another function, an internal service, or an external API), any of which may fail (Temporal will automatically set timeouts and retry, as well as remember the state of execution in the event of power loss)
- Do something that takes longer than 5 or 30 seconds (Vercel's serverless function execution [time limit](https://vercel.com/docs/platform/limits) for Hobby or Enterprise accounts, respectively)
- Do something after a certain amount of time, like an hour or a month (or periodically—once an hour, or once a month)

The starter project has this logic flow:

- Load [`localhost:3000`](http://localhost:3000)
- Click the “Create order” button
- The click handler POSTs a new order object to `/api/orders`
- The serverless function at `pages/api/orders/index.ts`:
  - Parses the order object
  - Tells Temporal Server to start a new Order Workflow, and passes the user ID and order info
  - Waits for the Workflow result and returns it to the client
- Temporal Server puts Workflow tasks on the `orders` task queue
- The Worker executes chunks of Workflow and Activity code. The Activity code logs:

```
Reserving 2 of item B102
Charging user 123 for 2 of item B102
```

The Workflow code is: `temporal/src/workflows/order.ts` and the Activites code is: `temporal/src/activities/{payment|inventory}.ts`.

## Deploy your own

### Web server

The Next.js server can be deployed using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-temporal&project-name=with-temporal&repository-name=with-temporal)

### Worker

One or more instances of the worker (`temporal/src/worker/`) can be deployed to a PaaS (each worker is a long-running Node process, so it can't run on a FaaS/serverless platform).

### Temporal Server

Temporal Server is a cluster of internal services, a database of record, and a search database. It can be run locally with Docker Compose and [deployed](https://docs.temporal.io/docs/server/production-deployment) with a container orchestration service like Kubernetes or ECS.

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

In the `next-temporal-app/` directory:

```bash
npm run dev
```

```bash
npm run build-worker.watch
```

```bash
npm run start-worker
```
