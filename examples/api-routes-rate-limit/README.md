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

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/api-routes-rate-limit)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/api-routes-rate-limit&project-name=api-routes-rate-limit&repository-name=api-routes-rate-limit)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example api-routes-rate-limit api-routes-rate-limit-app
# or
yarn create next-app --example api-routes-rate-limit api-routes-rate-limit-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
