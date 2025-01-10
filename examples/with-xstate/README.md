# XState example

This example shows how to integrate XState in Next.js. [Learn more about XState](https://xstate.js.org/).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-xstate)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-xstate&project-name=with-xstate&repository-name=with-xstate)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-xstate with-xstate-app
```

```bash
yarn create next-app --example with-xstate with-xstate-app
```

```bash
pnpm create next-app --example with-xstate with-xstate-app
```

### Inspect your machines using `@xstate/inspect`

You could use the inspection tools for XState: ([`@xstate/inspect`](https://xstate.js.org/docs/packages/xstate-inspect)) to debug and visualize your machines in development mode.

#### Install @xstate/inspect

```bash
npm install @xstate/inspect
# or
yarn add @xstate/inspect
# or
pnpm add @xstate/inspect
```

#### Import it at the top of the project

```js
import { inspect } from "@xstate/inspect";
```

#### Use the inspect method

Note that for Next.js projects, you should ensure that the inspector code only runs on the client, rather than the server:

```js
if (typeof window !== "undefined") {
  inspect({
    /* options */
  });
}
```

### Deploy to Now

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## References

- [xstate](https://github.com/davidkpiano/xstate) repository
- [@xstate/react](https://xstate.js.org/docs/packages/xstate-react) documentation
- [@xstate/inspect](https://xstate.js.org/docs/packages/xstate-inspect/#faqs) usage with Next.JS
