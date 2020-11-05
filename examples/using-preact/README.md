# Preact example

This example uses [Preact](https://github.com/preactjs/preact) instead of React. It's a React like UI framework which is fast and small.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example using-preact using-preact-app
# or
yarn create next-app --example using-preact using-preact-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

### Aliasing react -> preact

Using `preact` with `next.js` depends on aliasing react packages to preact ones (like `@preact/compat`). This is done directly in the [`package.json`](./package.json) dependencies.

### next-plugin-preact

This example was [updated](https://github.com/vercel/next.js/pull/18588) to use [`next-plugin-preact`](https://github.com/preactjs/next-plugin-preact) and now requires minimal configuration, if you want to add preact without a plugin, or see how it works, head to the previous [`next.config.js`](https://github.com/vercel/next.js/blob/629884af7d3ced97b8c2ec7aebdfb1a3a5d808f0/examples/using-preact/next.config.js).
