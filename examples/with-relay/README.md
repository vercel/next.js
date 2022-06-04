# Relay and TypeScript Example

This example shows how to integrate Relay in Next.js. The application is built with TypeScript and
leverages the
[Next.js compiler's built-in Relay support](https://nextjs.org/docs/advanced-features/compiler#relay)
for converting GraphQL operations to runtime artifacts.

Note this example uses with the [GitHub GraphQL API](https://docs.github.com/en/graphql) which requires authentication. In order to make requests to the API, you must first [generate a personal access token on GitHub](https://github.com/settings/tokens/new) and store it in the environment variable `NEXT_PUBLIC_GITHUB_API_TOKEN`.

## Deploy your own

Deploy the example using
[Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or
preview live with
[StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-relay)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-relay&project-name=with-relay&repository-name=with-relay)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app)
with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/),
or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-relay with-relay-app
# or
yarn create next-app --example with-relay with-relay-app
# or
pnpm create next-app --example with-relay with-relay-app
```

Deploy it to the cloud with
[Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example)
([Documentation](https://nextjs.org/docs/deployment)).
