# Route Handlers

This example shows [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) in the App Router. A `route.ts` file inside `app` exports a function per HTTP method and works with the Web [Request](https://developer.mozilla.org/docs/Web/API/Request) and [Response](https://developer.mozilla.org/docs/Web/API/Response) APIs.

| Endpoint                      | Shows                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /api/users`              | Returning JSON with `Response.json`                                                                       |
| `GET` / `PUT /api/users/[id]` | Dynamic segments with `RouteContext`, reading the body; methods without an export get `405` automatically |
| `/api/cors`                   | Setting CORS headers and answering preflight `OPTIONS` requests                                           |
| `GET /api/cookies`            | Reading and setting cookies with `cookies()`                                                              |
| `/api/graphql`                | A GraphQL endpoint with [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server)                         |

> Route Handlers are the App Router equivalent of [API Routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) in the Pages Router. The [`api-routes`](https://github.com/vercel/next.js/tree/canary/examples/api-routes) example implements the same endpoints with API Routes.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/route-handlers&project-name=route-handlers&repository-name=route-handlers)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example route-handlers route-handlers-app
```

```bash
yarn create next-app --example route-handlers route-handlers-app
```

```bash
pnpm create next-app --example route-handlers route-handlers-app
```

```bash
bunx create-next-app --example route-handlers route-handlers-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/app/getting-started/deploying)).
