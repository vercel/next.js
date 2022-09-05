# Next.js + Xata

This example showcases how to use Next.js with [Xata](https://xata.io) as your data layer.

With this template you get out-of-the-box:

- API Route to connect to your Xata database
- Type-safe Codegen
- Accessibility-Ready
  - Dark/Light mode
  - Respects `prefers-reduce-motion` for CSS Transitions

## Demo

[nextjs-with-xata.vercel.app](https://nextjs-with-xata.vercel.app)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```sh
npx create-next-app --example cms-contentful cms-contentful-app
```

```sh
yarn create next-app --example cms-contentful cms-contentful-app
```

```sh
pnpm create next-app --example cms-contentful cms-contentful-app
```

### Link Your Xata Workspace and Run Codegen

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
