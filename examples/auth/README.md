# Authentication

This is an example using NextAuth.js for authentication, with GitHub sign-in and a Playwright test of it.

In development and tests, the example signs in with [Mockatoo](https://mockatoo.globalunderdog.com)'s mock of GitHub, so you don't need a GitHub OAuth app until you deploy. Production builds use GitHub.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/auth&project-name=auth&repository-name=auth&env=AUTH_GITHUB_ID,AUTH_GITHUB_SECRET,AUTH_SECRET)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example auth auth-app
```

```bash
yarn create next-app --example auth auth-app
```

```bash
pnpm create next-app --example auth auth-app
```

```bash
bunx create-next-app --example auth auth-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Run it locally

1. Copy `.env.example` to `.env.local` and set `AUTH_SECRET` (run `npx auth secret`).
2. Create a free test account at [app.mockatoo.globalunderdog.com](https://app.mockatoo.globalunderdog.com), and set `MOCK_EMAIL` and `MOCK_PASSWORD` to its email and password.
3. Run `npm run dev` and sign in with GitHub using that email and password.

For production, create a [GitHub OAuth app](https://github.com/settings/developers) and set `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`. Don't set `MOCK_EMAIL` or `MOCK_PASSWORD` in production.

## End-to-end tests

`e2e/sign-in.spec.ts` signs in with GitHub and out again. Playwright starts the dev server and reads `MOCK_EMAIL` and `MOCK_PASSWORD` from `.env.local`; in CI, set them as secrets.

```bash
npx playwright install chromium
npm run test:e2e
```
