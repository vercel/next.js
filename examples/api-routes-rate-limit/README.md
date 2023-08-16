# API Routes Rate Limiting Example

This example uses `lru-cache` to implement a simple rate limiter for API routes ([Serverless Functions](https://vercel.com/docs/serverless-functions/introduction)).

**Demo: https://nextjs-rate-limit.vercel.app/**

```bash
curl http://localhost:3000/api/user -I
HTTP/1.1 200 OK
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9

curl http://localhost:3000/api/user -I
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
```

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/api-routes-rate-limit)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/api-routes-rate-limit&project-name=api-routes-rate-limit&repository-name=api-routes-rate-limit)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example api-routes-rate-limit api-routes-rate-limit-app
```

```bash
yarn create next-app --example api-routes-rate-limit api-routes-rate-limit-app
```

```bash
pnpm create next-app --example api-routes-rate-limit api-routes-rate-limit-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
