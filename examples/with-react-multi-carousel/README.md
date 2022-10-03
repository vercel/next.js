# react-multi-carousel example

[react-multi-carousel](https://www.npmjs.com/package/react-multi-carousel) is a React component that provides a Carousel that renders on the server-side that supports multiple items with no external dependency.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-react-multi-carousel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-react-multi-carousel&project-name=with-react-multi-carousel&repository-name=with-react-multi-carousel)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-react-multi-carousel with-react-multi-carousel-app
```

```bash
yarn create next-app --example with-react-multi-carousel with-react-multi-carousel-app
```

```bash
pnpm create next-app --example with-react-multi-carousel with-react-multi-carousel-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## How does it work with ssr?

- On the server-side, we detect the user's device to decide how many items we are showing and then using flex-basis to assign \* width to the carousel item.
- On the client-side, old fashion getting width of the container and assign the average of it to each carousel item.
