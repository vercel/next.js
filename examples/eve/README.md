# Next.js + eve

This example runs an [eve](https://eve.dev) agent inside a Next.js app. The agent triages issues: a decision model classifies each one, and a reviewer subagent checks the ones it is unsure about.

- `next.config.ts`: `withEve()` serves the agent at `/eve/v1/*`
- `agent/tools/triage_issues.ts`: the triage workflow
- `agent/subagents/reviewer/`: the reviewer subagent
- `agent/lib/sample-issues.ts`: the sample issues
- `app/triage.tsx`: the UI, built with `useEveAgent` from `eve/react`

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/eve&project-name=eve&repository-name=eve)

## How to use

This example requires Node.js 24 or later.

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example eve eve-app
```

```bash
yarn create next-app --example eve eve-app
```

```bash
pnpm create next-app --example eve eve-app
```

### Set up the model

The agent, the reviewer, and the decision model use models through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which needs an `AI_GATEWAY_API_KEY` or the Vercel project's OIDC credentials. To use a key, copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

To call a provider directly or use a local model instead, see [Set the model](https://eve.dev/docs/agent-config#set-the-model).

### Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and select **Run triage**. To see more issues go to the reviewer, raise `CONFIDENCE_THRESHOLD` in `agent/lib/triage.ts`.

To run a production build locally, build the agent with `eve build` before you start Next.js:

```bash
npx eve build
npm run build
npm start
```

### Authentication

`agent/channels/eve.ts` uses `none()` so the deployed demo accepts anonymous browser requests, including deployments made with the Deploy button. This means anyone who finds your deployment can call the agent and spend your AI Gateway credits. Replace `none()` with your app's auth, or remove the deployment when you're done trying it. See [Auth & route protection](https://eve.dev/docs/guides/auth-and-route-protection).

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
