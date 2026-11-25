# API Routes

This example shows [API Routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) in the Pages Router. Every file in `pages/api` becomes an endpoint under `/api` and receives Node.js-style `req` and `res` objects.

| Endpoint                      | Shows                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/users`              | Returning JSON                                                                    |
| `GET` / `PUT /api/users/[id]` | Dynamic segments, reading the method and body, `405` for other methods            |
| `/api/cors`                   | Setting CORS headers and answering preflight `OPTIONS` requests                   |
| `GET /api/cookies`            | Reading `req.cookies` and setting a cookie with `Set-Cookie`                      |
| `/api/graphql`                | A GraphQL endpoint with [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) |

> API Routes are only available in the Pages Router (`pages` directory). If you are using the App Router, use [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) instead. The [`route-handlers`](https://github.com/vercel/next.js/tree/canary/examples/route-handlers) example implements the same endpoints.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/api-routes&project-name=api-routes&repository-name=api-routes)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example api-routes api-routes-app
```

```bash
yarn create next-app --example api-routes api-routes-app
```

```bash
pnpm create next-app --example api-routes api-routes-app
```

```bash
bunx create-next-app --example api-routes api-routes-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/app/getting-started/deploying)).
