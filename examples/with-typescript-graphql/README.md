# TypeScript and GraphQL Example

One of the strengths of GraphQL is [enforcing data types on runtime](https://graphql.github.io/graphql-spec/June2018/#sec-Value-Completion). Further, TypeScript and [GraphQL Code Generator](https://graphql-code-generator.com/) (graphql-codegen) make it safer by typing data statically, so you can write truly type-protected code with rich IDE assists.

This template gives you the best start to use GraphQL with fully typed queries (client-side) and resolvers (server-side), all this with minimum bundle size 📦

```tsx
import { useQuery } from "@apollo/client";
import { ViewerDocument } from "lib/graphql-operations";

const News = () => {
  // Typed already️⚡️
  const {
    data: { viewer },
  } = useQuery(ViewerDocument);

  return <div>{viewer.name}</div>;
};
```

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-typescript-graphql&project-name=with-typescript-graphql&repository-name=with-typescript-graphql)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-typescript-graphql with-typescript-graphql-app
```

```bash
yarn create next-app --example with-typescript-graphql with-typescript-graphql-app
```

```bash
pnpm create next-app --example with-typescript-graphql with-typescript-graphql-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
