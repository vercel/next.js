# Next.js + Workflow SDK

This example runs a durable background job in a Next.js app with [Workflow SDK](https://workflow-sdk.dev). Signing up starts an onboarding workflow that creates a user, sends a welcome email, waits, and sends a follow-up email. The run page streams each step's progress as it happens.

The first welcome email attempt fails on purpose, so you can watch Workflow SDK retry the step without repeating the steps that already completed. Reload the run page or close the tab, and the workflow keeps going.

- `next.config.ts`: `withWorkflow()` compiles the workflow and adds the routes that run it
- `workflows/onboarding.ts`: the workflow and its steps
- `app/actions.ts`: a Server Function that starts the workflow with `start()`
- `app/api/runs/[runId]/stream/route.ts`: a Route Handler that streams a run's progress
- `app/runs/[runId]/run-progress.tsx`: the run page UI, which reads the stream

To learn when to use a workflow instead of `after`, see [Background Jobs](https://nextjs.org/docs/app/guides/background-jobs) in the Next.js docs.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/workflow&project-name=workflow&repository-name=workflow)

On Vercel, workflows run on [Vercel Workflow](https://vercel.com/docs/workflows) with no extra configuration, and runs appear in your project's dashboard.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example workflow workflow-app
```

```bash
yarn create next-app --example workflow workflow-app
```

```bash
pnpm create next-app --example workflow workflow-app
```

### Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter an email, and select **Sign up**.

In development, Workflow SDK stores runs and queues jobs on your local filesystem. To inspect runs, steps, and retries, open the local dashboard:

```bash
npx workflow web
```

### Self-hosting

To run workflows on your own infrastructure, such as `next start` or a Docker container, use the [Postgres World](https://workflow-sdk.dev/worlds/postgres). See [Worlds](https://workflow-sdk.dev/worlds) for other options.

## Learn more

- [Workflow SDK documentation](https://workflow-sdk.dev/docs)
- [Workflows and steps](https://workflow-sdk.dev/docs/foundations/workflows-and-steps)
- [Errors and retries](https://workflow-sdk.dev/docs/foundations/errors-and-retries)
- [Streaming](https://workflow-sdk.dev/docs/foundations/streaming)
