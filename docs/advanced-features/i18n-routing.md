# Internationalized Routing

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/i18n-routing">i18n routing</a></li>
  </ul>
</details>

Next.js has built-in support for internationalized (i18n) routing since `v9.5.7`. You can provide a list of locales, the default locale, and domain-specific locales and Next.js will automatically handle the routing.

The i18n routing support is currently meant to complement existing i18n library solutions like react-intl, react-i18next, lingui, rosetta, and others by streamlining the routes and locale parsing.

## Getting started

To get started, add the `i18n` config to your `next.config.js` file.

```js
module.exports = {
  i18n: {
    // These are all the locales you want to support in
    // your application
    locales: ['en-US', 'fr', 'nl-NL'],
    // This is the default locale you want to be used when visiting
    // a non-local prefixed path e.g. `/hello`
    defaultLocale: 'en-US',
    // These are a list of locale domains and the default locale they
    // should handle (these are not required)
    domains: [
      {
        domain: 'example.com',
        defaultLocale: 'en-US',
      },
      {
        domain: 'example.nl',
        defaultLocale: 'nl-NL',
      },
      {
        domain: 'example.fr',
        defaultLocale: 'fr',
      },
    ],
  },
}
```

## How are the routes handled

When a user visits `/`, Next.js will try to automatically detect which locale the user prefers with the [`Accept-Language`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language) header and the current domain.

If a locale other than the default locale is detected, the user will be redirected to either:

A) The domain with that locale specified as the default.
B) The locale prefixed path if no domain matched.

For example, if a user with the `Accept-Language` header `fr;q=0.9` visits `example.com`, they will be redirected to `example.fr` since that domain handles the `fr` locale by default.

If we did not have the `example.fr` domain configured, then the user would instead be redirected to `/fr`.

## Accessing the locale information

The detected locale information is provided in multiple places to ensure it's available where it might be needed.

On the `next/router` instance available via the [`useRouter()`](https://nextjs.org/docs/api-reference/next/router#userouter) hook, we expose the active locale under `router.locale`, all of the supported locales under `router.locales`, and the current default locale under `router.defaultLocale`.

When prerendering pages with `getStaticProps`, the locale information is provided in [the context](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation) provided to the function as `locale` for the active locale and `locales` for all supported locales.

When leveraging `getStaticPaths`, the supported locales are also provided in the context provided to the function under `locales`.

## Transition between locales

You can use `next/link` or `next/router` to transition between locales.

For `next/link`, a `locale` prop can be provided to transition to a different locale from the currently active one. If no `locale` prop is provided, the currently active `locale` is used during client-transitions. For example:

```jsx
import Link from 'next/link'

export default function IndexPage(props) {
  return (
    <Link href="/another" locale="fr">
      <a>To /fr/another</a>
    </Link>
  )
}
```

When using the `next/router` methods directly, you can specify the `locale` that should be used via the transition options. For example:

```jsx
import { useRouter } from 'next/router'

export default function IndexPage(props) {
  const router = useRouter()

  return (
    <div
      onClick={() => {
        router.push('/another', '/another', { locale: 'fr' })
      }}
    >
      to /fr/another
    </div>
  )
}
```

## How does this work with static generation?

### Automatically Statically Optimized Pages

For pages that are automatically statically optimized, a version of the page will be generated for each locale. This ensures the `lang` HTML attribute and `router.locale` value have the correct initial values for each locale.

### Non-dynamic getStaticProps Pages

For non-dynamic `getStaticProps` pages, a version is generated for each locale like above. `getStaticProps` is also called with each `locale` that is being rendered. If you would like to opt-out of a certain locale from being pre-rendered, you can return `notFound: true` from `getStaticProps` and this variant of the page will not be generated.

### Dynamic getStaticProps Pages

For dynamic `getStaticProps` pages, any locale variants of the page that is desired to be prerendered needs to be returned from [`getStaticPaths`](/docs/basic-features/data-fetching#getstaticpaths-static-generation). Along with the `params` object that can be returned for the `paths`, you can also return a `locale` field specifying which locale you want to render. For example:

```js
// pages/blog/[slug].js
export const getStaticPaths = ({ locales }) => {
  return {
    paths: [
      { params: { slug: 'post-1' }, locale: 'en-US' },
      { params: { slug: 'post-1' }, locale: 'fr' },
    ],
    fallback: true,
  }
}
```
