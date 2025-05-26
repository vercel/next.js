# framer-motion example

Framer [`Motion`](https://github.com/framer/motion) is a production-ready animation library. By using a custom [`<App>`](https://nextjs.org/docs/advanced-features/custom-app) along with Motion's [`AnimatePresence`](https://www.framer.com/api/motion/animate-presence/) component, transitions between Next pages becomes simple and declarative.

When using Next's `<Link>` component, you will likely want to [disable the default scroll behavior](https://nextjs.org/docs/api-reference/next/link#disable-scrolling-to-the-top-of-the-page) for a more seamless navigation experience. Scrolling to the top of a page can be re-enabled by adding a `onExitComplete` callback on the `AnimatePresence` component.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-framer-motion&project-name=with-framer-motion&repository-name=with-framer-motion)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-framer-motion with-framer-motion-app
```

```bash
yarn create next-app --example with-framer-motion with-framer-motion-app
```

```bash
pnpm create next-app --example with-framer-motion with-framer-motion-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
