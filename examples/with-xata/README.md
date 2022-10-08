# Next.js + Xata

This example showcases how to use Next.js with [Xata](https://xata.io) as your data layer.

With this template you get out-of-the-box:

- API Route to connect to your Xata database
- Type-safe Codegen
- Accessibility-Ready
  - Dark/Light mode
  - Respects `prefers-reduce-motion` for CSS Transitions

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-xata)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-xata&project-name=with-xata&repository-name=with-xata)

## Demo

[nextjs-with-xata.vercel.app](https://nextjs-with-xata.vercel.app)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```sh
npx create-next-app --example with-xata with-xata-app
```

```sh
yarn create next-app --example with-xata with-xata-app
```

```sh
pnpm create next-app --example with-xata with-xata-app
```

### Link Your Xata Workspace and Run Codegen

> 💡 consider [installing the Xata CLI globally](https://xata.io/docs/cli/getting-started), it will likely improve your experience managing your databases

```sh
npm run start:xata
```

> ⚠️ once linked, you can just run `xata` to re-generate types.

### Start Coding

Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

> 💡 the template will prompt you to create a dummy new table (`nextjs_with_xata_example`) with some useful resources.

## Notes

Some tips that may help you develop your app.

- The Xata [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=xata.xata) will make managing your data more comfortable
- Prefer fetching data from `getServerSideProps()` or `getStaticProps()`
- Create a Serverless Route(s) to handle data mutations

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
