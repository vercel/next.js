# with-route-as-modal

On many popular social media, opening a post will update the URL but won't trigger a navigation and will instead display the content inside a modal. This behavior ensures the user won't lose the current UI context (scroll position). The URL still reflect the post's actual page location and any refresh will bring the user there. This behavior ensures great UX without neglecting SEO.

This example shows how to conditionally display a modal based on a route.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-route-as-modal&project-name=with-route-as-modal&repository-name=with-route-as-modal)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-route-as-modal with-route-as-modal-app
```

```bash
yarn create next-app --example with-route-as-modal with-route-as-modal-app
```

```bash
pnpm create next-app --example with-route-as-modal with-route-as-modal-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
