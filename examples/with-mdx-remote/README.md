# MDX Remote Example

This example shows how a simple blog might be built using the [next-mdx-remote](https://github.com/hashicorp/next-mdx-remote) library, which allows mdx content to be loaded via `getStaticProps` or `getServerSideProps`. In this example, the mdx content is loaded from a local folder, but it could be loaded from a database or anywhere else. The demo also showcases [next-remote-watch](https://github.com/hashicorp/next-remote-watch), a library that allows next.js to watch files outside the `pages` folder that are not explicitly imported, which enables the mdx content here to trigger a live reload on change.

Since `next-remote-watch` uses undocumented Next.js APIs, it doesn't replace the default `dev` script for this example. To use it, run `yarn dev:watch` or `npm run start:watch`.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-mdx-remote)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-mdx with-mdx-remote-app
# or
yarn create next-app --example with-mdx with-mdx-remote-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-mdx-remote
cd with-mdx-remote
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

## Notes

### Conditional custom components

When using `next-mdx-remote`, you can pass custom components to the MDX renderer. However, some pages/MDX files might use components that are used infrequently, or only on a single page. To avoid loading those components on every MDX page, you can use `next/dynamic` to conditionally load them.

For example, here's how you can change `getInitialProps` to conditionally add certain components:

```js
import dynamic from "next/dynamic"
...

async function getInitialProps() {
  const { content, data } = matter(source)

  const components = {
    ...defaultComponents,
    SomeHeavyComponent: /<SomeHeavyComponent/.test(content) ? dynamic(() => import("SomeHeavyComponent")) : null,
  }

  const mdxSource = await renderToString(content, {
    components,
    ...otherOptions,
  })
}
```

If you do this, you'll need to also check in the page render function which components need to be dynamically loaded. You can pass a list of components names via `getInitialProps` to accomplish this.
