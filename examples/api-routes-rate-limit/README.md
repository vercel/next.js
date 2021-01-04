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

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/api-routes-rate-limit)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example api-routes api-routes-rate-limit
# or
yarn create next-app --example api-routes api-routes-rate-limit
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
