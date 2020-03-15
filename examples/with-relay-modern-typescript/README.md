# Relay Modern Typescript Example

One of the strengths of GraphQL is [enforcing data types on runtime](https://graphql.github.io/graphql-spec/June2018/#sec-Value-Completion). Further, TypeScript and [Relay Compiler](https://www.npmjs.com/package/relay-compiler) make it safer by typing data statically, so you can write truly type-protected code with rich IDE assists.

This template extends [Relay Modern Example](https://github.com/zeit/next.js/tree/canary/examples/with-relay-modern) by rewriting in TypeScript and integrating type generation care of [Relay Compiler](https://www.npmjs.com/package/relay-compiler) under the hood.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-relay-modern)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-relay-modern-typescript with-relay-modern-typescript-app
# or
yarn create next-app --example with-relay-modern-typescript with-relay-modern-typescript-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-relay-modern-typescript
cd with-relay-modern-typescript
```

Install it:

```bash
npm install
# or
yarn
```

Download schema introspection data from configured Relay endpoint

```bash
npm run schema
# or
yarn schema
```

Run Relay ahead-of-time compilation (should be re-run after any edits to components that query data with Relay)

```bash
npm run relay
# or
yarn relay
```

Run the project

```bash
npm run dev
# or
yarn dev
```

Deploy it to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
