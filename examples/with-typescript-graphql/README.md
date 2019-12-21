# GraphQL and TypeScript Example

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-typescript-graphql)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-typescript-graphql with-typescript-graphql-app
# or
yarn create next-app --example with-typescript-graphql with-typescript-graphql-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-typescript-graphql
cd with-typescript-graphql
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

One of the strengths of GraphQL is enforcing data types on runtime. Further, TypeScript and [GraphQL Code Generator](https://graphql-code-generator.com/) (grapql-codegen) make it safer to type data statically, so you can write truly type-protected code with rich IDE assists.

This template extends [Apollo Server and Client Example](https://github.com/zeit/next.js/tree/canary/examples/api-routes-apollo-server-and-client#readme) by rewriting in TypeScript and integrating [graphql-let](https://github.com/piglovesyou/graphql-let#readme), which runs graphql-codegen under the hood and enhances the use of typed GraphQL operation, like below.

```typescript jsx
import { useNewsQuery } from './news.grpahql'

const  News: React.FC<{}> = (props) => {
	// Typed already️⚡️
	const { data: { news } } = useNewsQuery()
	if (news) <div>{news.map(...)}</div>
}
```

Note: Do not be alarmed that you see two renders being executed. Apollo recursively traverses the React render tree looking for Apollo query components. When it has done that, it fetches all these queries and then passes the result to a cache. This cache is then used to render the data on the server side (another React render).
https://www.apollographql.com/docs/react/api/react-ssr/#getdatafromtree
