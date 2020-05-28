# Reason Relay Example

[Reason Relay](https://reason-relay-documentation.zth.now.sh/)

This example relies on [graph.cool](https://www.graph.cool) for its GraphQL backend.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-reason-relay)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-reason-relay with-reason-relay
# or
yarn create next-app --example with-reason-relay with-reason-relay
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-reason-relay
cd with-reason-relay
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

Build the project

```bash
npm run build
# or
yarn build
```

Run the project

```bash
npm run dev
# or
yarn dev
```

Deploy it to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
