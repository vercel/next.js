# Next.js + eve

This example shows how to run an [eve](https://eve.dev) agent and a Next.js app as one project with the built-in [`eve/next`](https://eve.dev/docs/guides/frontend/nextjs) integration.

- `next.config.ts` wraps the config with `withEve()`. This mounts the agent in `agent/` at `/eve/v1/*`, on the same origin as the app.
- `agent/` defines the agent: its model (`agent.ts`), its system prompt (`instructions.md`), a typed `get_weather` tool, and the auth policy for browser requests (`channels/eve.ts`).
- `app/chat.tsx` is a Client Component that talks to the agent through the `useEveAgent` hook from `eve/react`.

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

The agent uses a model through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which needs an `AI_GATEWAY_API_KEY` or the Vercel project's OIDC credentials. To use a key, copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

To call a provider directly or use a local model instead, see [Set the model](https://eve.dev/docs/agent-config#set-the-model).

### Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and ask about the weather.

To run a production build locally, build the agent with `eve build` before you start Next.js:

```bash
npx eve build
npm run build
npm start
```

### Authentication

`agent/channels/eve.ts` uses `none()` so the deployed demo accepts anonymous browser requests, including deployments made with the Deploy button. This means anyone who finds your deployment can call the agent and spend your AI Gateway credits. Replace `none()` with your app's auth, or remove the deployment when you're done trying it. See [Auth & route protection](https://eve.dev/docs/guides/auth-and-route-protection).

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
