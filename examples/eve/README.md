# Next.js + eve

This example shows how to run an [eve](https://eve.dev) agent and a Next.js app as one project with the built-in [`eve/next`](https://eve.dev/docs/guides/frontend/nextjs) integration.

The agent triages a small batch of sample issues. A fast decision model gives every issue a category and a priority in one step. Only the issues it is unsure about go to a reviewer subagent, so most issues never need a full agent turn.

- `next.config.ts` wraps the config with `withEve()`. This mounts the agent in `agent/` at `/eve/v1/*`, on the same origin as the app.
- `agent/tools/triage_issues.ts` is a [workflow tool](https://eve.dev/docs/tools/workflows). It loads the issues, decides them with `decide()` from `eve/ai` (`agent/lib/decide.ts`), and sends each issue below the confidence threshold to the reviewer with `ctx.agent("reviewer")`. It yields progress as it works, so the app can show each issue as it is decided.
- `agent/subagents/reviewer/` is the reviewer subagent. It sees only the issue it is sent and returns a typed category, priority, and summary.
- `agent/lib/issues.ts` holds the sample issues. Replace `loadIssues()` with a call to your issue tracker.
- `agent/channels/eve.ts` sets the auth policy for browser requests.
- `app/triage.tsx` is a Client Component that starts a run through the `useEveAgent` hook from `eve/react`. It renders the tool's progress as a table and shows the agent's one-sentence summary below it.

In development, `next dev` starts the eve dev server next to Next.js and forwards the eve routes to it. On Vercel, the app and the agent deploy as one project.

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

Open [http://localhost:3000](http://localhost:3000) and select **Triage issues**. To see more issues go to the reviewer, raise `CONFIDENCE_THRESHOLD` in `agent/lib/triage.ts`.

To run a production build locally, build the agent with `eve build` before you start Next.js:

```bash
npx eve build
npm run build
npm start
```

### Authentication

`agent/channels/eve.ts` uses `none()` so the deployed demo accepts anonymous browser requests, including deployments made with the Deploy button. This means anyone who finds your deployment can call the agent and spend your AI Gateway credits. Replace `none()` with your app's auth, or remove the deployment when you're done trying it. See [Auth & route protection](https://eve.dev/docs/guides/auth-and-route-protection).

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
