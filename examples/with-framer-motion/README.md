# framer-motion example

Framer [`Motion`](https://github.com/framer/motion) is a production-ready animation library. By using a custom [`<App>`](https://nextjs.org/docs#custom-app) along with Motion's [`AnimatePresence`](https://www.framer.com/api/motion/animate-presence/) component, transitions between Next pages becomes simple and declarative.

When using Next's `<Link>` component, you will likely want to [disable the default scroll behavior](https://nextjs.org/docs#disabling-the-scroll-changes-to-top-on-page) for a more seamless navigation experience. Scrolling to the top of a page can be re-enabled by adding a `onExitComplete` callback on the `AnimatePresence` component.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-framer-motion)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-framer-motion with-framer-motion
# or
yarn create next-app --example with-framer-motion with-framer-motion
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-framer-motion
cd with-framer-motion
```

Install it and run:

```bash
npm install
npm run build
npm start
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
