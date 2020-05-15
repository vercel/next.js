# with-route-as-modal-page

This example is a port of the `with-route-as-modal` example but uses [dynamic routes](https://nextjs.org/docs/routing/dynamic-routes), [getStaticPaths](https://nextjs.org/docs/basic-features/data-fetching#getstaticpaths-static-generation), and [getStaticProps](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation) to ensure each modal route is also a modal page. This is an important distinction and makes sure the experience is the same should the URL (route) be shared as a link, e.g. index.js need not be the only entrypoint to the website.

> From _with-route-as-modal_

> On many popular social media, opening a post will update the URL but won't trigger a navigation and will instead display the content inside a modal. This behavior ensure the user won't lose the current UI context (scroll position). The URL still reflect the post's actual page location and any refresh will bring the user there. This behavior ensure great UX without neglecting SEO.

> This example show how to conditionally display a modal based on a route.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-route-as-modal-page)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-route-as-modal-page with-route-as-modal-page-app
# or
yarn create next-app --example with-route-as-modal-page with-route-as-modal-page-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-route-as-modal-page
cd with-route-as-modal-page
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
