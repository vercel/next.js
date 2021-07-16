# MDX Bundler Example

This example shows how a simple blog might be built using the [mdx-bundler](https://github.com/kentcdodds/mdx-bundler) library, which allows mdx content to be loaded via `getStaticProps` or `getServerSideProps`. The mdx content is loaded from a local folder, but it could be loaded from a database or anywhere else.

The example also showcases [next-remote-watch](https://github.com/hashicorp/next-remote-watch), a library that allows next.js to watch files outside the `pages` folder that are not explicitly imported, which enables the mdx content here to trigger a live reload on change.

Since `next-remote-watch` uses undocumented Next.js APIs, it doesn't replace the default `dev` script for this example. To use it, run `npm run dev:watch` or `yarn dev:watch`.

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-mdx-bundler)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-mdx-bundler&project-name=with-mdx-bundler&repository-name=with-mdx-bundler)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-mdx-bundler with-mdx-bundler-app
# or
yarn create next-app --example with-mdx-bundler with-mdx-bundler-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

### Conditional custom components

When using `next-mdx-bundler`, you can pass custom components to the MDX renderer. However, some pages/MDX files might use components that are used infrequently, or only on a single page. To avoid loading those components on every MDX page, you can use `next/dynamic` to conditionally load them.

For example, here's how you can change `getStaticProps` to pass a list of component names, checking the names in the page render function to see which components need to be dynamically loaded.

```js
import dynamic from 'next/dynamic'
import Test from '../components/test'
import { bundleMDX } from 'mdx-bundler'

const SomeHeavyComponent = dynamic(() => import('SomeHeavyComponent'))

const defaultComponents = { Test }

export function SomePage({ code, componentNames }) {
  const Component = React.useMemo(() => getMDXComponent(code), [code]);
  const components = {
    ...defaultComponents,
    SomeHeavyComponent: componentNames.includes('SomeHeavyComponent')
      ? SomeHeavyComponent
      : null,
  }

  return <Component components={components} />
}

export async function getStaticProps() {
  const source = `---
  title: Conditional custom components
  ---

  Some **mdx** text, with a default component <Test name={title}/> and a Heavy component <SomeHeavyComponent />
  `


  const componentNames = [
    /<SomeHeavyComponent/.test(content) ? 'SomeHeavyComponent' : null,
  ].filter(Boolean)

  const {code } = await bundleMDX(source)

  return {
    props: {
      mdxSource,
      componentNames,
    },
  }
}
```
