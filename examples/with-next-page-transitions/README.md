# next-page-transitions example

The [`next-page-transitions`](https://github.com/illinois/next-page-transitions) library is a component that sits at the app level and allows you to animate page changes. It works especially nicely with apps with a shared layout element, like a navbar. This component will ensure that only one page is ever mounted at a time, and manages the timing of animations for you. This component works similarly to [`react-transition-group`](https://github.com/reactjs/react-transition-group) in that it applies classes to a container around your page; it's up to you to write the CSS transitions or animations to make things pretty!

This example includes two pages with links between them. The "About" page demonstrates how `next-page-transitions` makes it easy to add a loading state when navigating to a page: it will wait for the page to "load" its content (in this examples, that's simulated with a timeout) and then hide the loading indicator and animate in the page when it's done.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-next-page-transitions)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-next-page-transitions&project-name=with-next-page-transitions&repository-name=with-next-page-transitions)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-next-page-transitions with-next-page-transitions-app
```

```bash
yarn create next-app --example with-next-page-transitions with-next-page-transitions-app
```

```bash
pnpm create next-app --example with-next-page-transitions with-next-page-transitions-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
