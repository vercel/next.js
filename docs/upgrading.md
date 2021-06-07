---
description: Learn how to upgrade Next.js.
---

# Upgrade Guide

## Upgrading from version 10 to 11

### Remove `super.componentDidCatch()` from `pages/_app.js`

The `next/app` component's `componentDidCatch` has been deprecated since Next.js 9 as it's no longer needed and has since been a no-op, in Next.js 11 it has been removed.

If your `pages/_app.js` has a custom `componentDidCatch` method you can remove `super.componentDidCatch` as it is no longer needed.

### Remove `Container` from `pages/_app.js`

This export has been deprecated since Next.js 9 as it's no longer needed and has since been a no-op with a warning during development. In Next.js 11 it has been removed.

If your `pages/_app.js` imports `Container` from `next/app` you can remove `Container` as it has been removed. Learn more in [the documentation](https://nextjs.org/docs/messages/app-container-deprecated).

### Remove `props.url` usage from page components

This property has been deprecated since Next.js 4 and has since shown a warning during development. With the introduction of `getStaticProps` / `getServerSideProps` these methods already disallowed usage of `props.url`. In Next.js 11 it has been removed completely.

You can learn more in [the documentation](https://nextjs.org/docs/messages/url-deprecated).

### Remove `unsized` property on `next/image`

The `unsized` property on `next/image` was deprecated in Next.js 10.0.1. You can use `layout="fill"` instead. In Next.js 11 `unsized` was removed.

### Remove `modules` property on `next/dynamic`

The `modules` and `render` option for `next/dynamic` have been deprecated since Next.js 9.5 showing a warning that it has been deprecated. This was done in order to make `next/dynamic` close to `React.lazy` in API surface. In Next.js 11 the `modules` and `render` options have been removed.

This option hasn't been mentioned in the documentation since Next.js 8 so it's less likely that your application is using it.

If you application does use `modules` and `render` you can refer to [the documentation](https://nextjs.org/docs/messages/next-dynamic-modules).

## React 16 to 17

React 17 introduced a new [JSX Transform](https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html) that brings a long-time Next.js feature to the wider React ecosystem: Not having to `import React from 'react'` when using JSX. When using React 17 Next.js will automatically use the new transform. This transform does not make the `React` variable global, which was an unintended side-effect of the previous Next.js implementation. A [codemod is available](/docs/advanced-features/codemods.md#add-missing-react-import) to automatically fix cases where you accidentally used `React` without importing it.

## Upgrading from version 9 to 10

There were no breaking changes between version 9 and 10.

To upgrade run the following command:

```
npm install next@latest
```

## Upgrading from version 8 to 9

### Preamble

#### Production Deployment on Vercel

If you previously configured `routes` in your `vercel.json` file for dynamic routes, these rules can be removed when leveraging Next.js 9's new [Dynamic Routing feature](/docs/routing/dynamic-routes.md).

Next.js 9's dynamic routes are **automatically configured on [Vercel](https://vercel.com/)** and do not require any `vercel.json` customization.

You can read more about [Dynamic Routing here](/docs/routing/dynamic-routes.md).

#### Check your Custom <App> (`pages/_app.js`)

If you previously copied the [Custom `<App>`](/docs/advanced-features/custom-app.md) example, you may be able to remove your `getInitialProps`.

Removing `getInitialProps` from `pages/_app.js` (when possible) is important to leverage new Next.js features!

The following `getInitialProps` does nothing and may be removed:

```js
class MyApp extends App {
  // Remove me, I do nothing!
  static async getInitialProps({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render() {
    // ... etc
  }
}
```

### Breaking Changes

#### `@zeit/next-typescript` is no longer necessary

Next.js will now ignore usage `@zeit/next-typescript` and warn you to remove it. Please remove this plugin from your `next.config.js`.

Remove references to `@zeit/next-typescript/babel` from your custom `.babelrc` (if present).

Usage of [`fork-ts-checker-webpack-plugin`](https://github.com/Realytics/fork-ts-checker-webpack-plugin/issues) should also be removed from your `next.config.js`.

TypeScript Definitions are published with the `next` package, so you need to uninstall `@types/next` as they would conflict.

The following types are different:

> This list was created by the community to help you upgrade, if you find other differences please send a pull-request to this list to help other users.

From:

```tsx
import { NextContext } from 'next'
import { NextAppContext, DefaultAppIProps } from 'next/app'
import { NextDocumentContext, DefaultDocumentIProps } from 'next/document'
```

to

```tsx
import { NextPageContext } from 'next'
import { AppContext, AppInitialProps } from 'next/app'
import { DocumentContext, DocumentInitialProps } from 'next/document'
```

#### The `config` key is now a special export on a page

You may no longer export a custom variable named `config` from a page (i.e. `export { config }` / `export const config ...`).
This exported variable is now used to specify page-level Next.js configuration like Opt-in AMP and API Route features.

You must rename a non-Next.js-purposed `config` export to something different.

#### `next/dynamic` no longer renders "loading..." by default while loading

Dynamic components will not render anything by default while loading. You can still customize this behavior by setting the `loading` property:

```jsx
import dynamic from 'next/dynamic'

const DynamicComponentWithCustomLoading = dynamic(
  () => import('../components/hello2'),
  {
    loading: () => <p>Loading</p>,
  }
)
```

#### `withAmp` has been removed in favor of an exported configuration object

Next.js now has the concept of page-level configuration, so the `withAmp` higher-order component has been removed for consistency.

This change can be **automatically migrated by running the following commands in the root of your Next.js project:**

```bash
curl -L https://github.com/vercel/next-codemod/archive/master.tar.gz | tar -xz --strip=2 next-codemod-master/transforms/withamp-to-config.js npx jscodeshift -t ./withamp-to-config.js pages/**/*.js
```

To perform this migration by hand, or view what the codemod will produce, see below:

**Before**

```jsx
import { withAmp } from 'next/amp'

function Home() {
  return <h1>My AMP Page</h1>
}

export default withAmp(Home)
// or
export default withAmp(Home, { hybrid: true })
```

**After**

```jsx
export default function Home() {
  return <h1>My AMP Page</h1>
}

export const config = {
  amp: true,
  // or
  amp: 'hybrid',
}
```

#### `next export` no longer exports pages as `index.html`

Previously, exporting `pages/about.js` would result in `out/about/index.html`. This behavior has been changed to result in `out/about.html`.

You can revert to the previous behavior by creating a `next.config.js` with the following content:

```js
// next.config.js
module.exports = {
  trailingSlash: true,
}
```

#### `./pages/api/` is treated differently

Pages in `./pages/api/` are now considered [API Routes](https://nextjs.org/blog/next-9#api-routes).
Pages in this directory will no longer contain a client-side bundle.

## Deprecated Features

#### `next/dynamic` has deprecated loading multiple modules at once

The ability to load multiple modules at once has been deprecated in `next/dynamic` to be closer to React's implementation (`React.lazy` and `Suspense`).

Updating code that relies on this behavior is relatively straightforward! We've provided an example of a before/after to help you migrate your application:

**Before**

```jsx
import dynamic from 'next/dynamic'

const HelloBundle = dynamic({
  modules: () => {
    const components = {
      Hello1: () => import('../components/hello1').then((m) => m.default),
      Hello2: () => import('../components/hello2').then((m) => m.default),
    }

    return components
  },
  render: (props, { Hello1, Hello2 }) => (
    <div>
      <h1>{props.title}</h1>
      <Hello1 />
      <Hello2 />
    </div>
  ),
})

function DynamicBundle() {
  return <HelloBundle title="Dynamic Bundle" />
}

export default DynamicBundle
```

**After**

```jsx
import dynamic from 'next/dynamic'

const Hello1 = dynamic(() => import('../components/hello1'))
const Hello2 = dynamic(() => import('../components/hello2'))

function HelloBundle({ title }) {
  return (
    <div>
      <h1>{title}</h1>
      <Hello1 />
      <Hello2 />
    </div>
  )
}

function DynamicBundle() {
  return <HelloBundle title="Dynamic Bundle" />
}

export default DynamicBundle
```
