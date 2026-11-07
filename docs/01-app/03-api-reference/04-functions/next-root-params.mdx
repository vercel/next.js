---
title: next/root-params
nav_title: root-params
description: API Reference for the next/root-params module that provides access to root-level route parameters.
related:
  description: Related API references and conventions.
  links:
    - app/api-reference/file-conventions/layout
    - app/api-reference/functions/generate-static-params
    - app/api-reference/directives/use-cache
    - app/api-reference/file-conventions/dynamic-routes
---

The `next/root-params` module provides getter functions for accessing root-level [parameters](/docs/app/api-reference/file-conventions/dynamic-routes) in [**Server Components**](/docs/app/glossary#server-component). Each root parameter is exported as an async function that resolves to the parameter value for the current route.

The export names are generated from your dynamic segment folder names. For example, if your root layout is inside `app/[locale]`, you import `locale` from `next/root-params`.

This is useful for values like a language or locale segment that need to be accessed across your application, for example in shared utilities, layouts, and deeply nested components, without passing them down as props.

```tsx filename="app/[lang]/layout.tsx" highlight={1,5} switcher
import { lang } from 'next/root-params'

export default async function RootLayout(props: LayoutProps<'/[lang]'>) {
  return (
    <html lang={await lang()}>
      <body>{props.children}</body>
    </html>
  )
}
```

```jsx filename="app/[lang]/layout.js" highlight={1,5} switcher
import { lang } from 'next/root-params'

export default async function RootLayout({ children }) {
  return (
    <html lang={await lang()}>
      <body>{children}</body>
    </html>
  )
}
```

Root parameters are the [dynamic segments](/docs/app/api-reference/file-conventions/dynamic-routes) that appear before the [root layout](/docs/app/api-reference/file-conventions/layout#root-layout). Unlike the regular [`params` prop](/docs/app/api-reference/file-conventions/page#params-optional), root parameter getters can be called from any Server Component in your application without prop drilling. See [Why root parameters are special](#why-root-parameters-are-special) for more details.

> **Good to know:**
>
> - Root parameter names must be valid JavaScript function identifiers. Kebab-cased segment names (e.g. `[post-slug]`) are not supported and will cause an error at dev time or during build.
> - `next/root-params` can be used in Server Components. It cannot be used in Client Components, Server Actions, or [Route Handlers](/docs/app/api-reference/file-conventions/route). Support for Route Handlers is planned for a future release.
> - Types for the `next/root-params` exports are generated during `next dev`, `next build`, or [`next typegen`](/docs/app/api-reference/cli/next#next-typegen-options), the same as [`PageProps` and `LayoutProps`](/docs/app/api-reference/config/typescript#route-aware-type-helpers).

## Root parameters and `generateStaticParams`

Root parameters are available as soon as you create the routes that define them. A [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params) function is only required with [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents), where each root parameter must have at least one value or the build fails.

With a single root parameter:

```tsx filename="app/[lang]/layout.tsx" highlight={11,12,13} switcher
import { lang } from 'next/root-params'

export default async function RootLayout(props: LayoutProps<'/[lang]'>) {
  return (
    <html lang={await lang()}>
      <body>{props.children}</body>
    </html>
  )
}

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'fr' }]
}
```

```jsx filename="app/[lang]/layout.js" highlight={11,12,13} switcher
import { lang } from 'next/root-params'

export default async function RootLayout({ children }) {
  return (
    <html lang={await lang()}>
      <body>{children}</body>
    </html>
  )
}

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'fr' }]
}
```

With multiple root parameters, return a value for each:

```tsx filename="app/[lang]/[locale]/layout.tsx"
export async function generateStaticParams() {
  return [
    { lang: 'en', locale: 'us' },
    { lang: 'en', locale: 'uk' },
  ]
}
```

### Reading root parameters in a nested `generateStaticParams`

Inside a nested segment's [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params), you can read a root parameter directly with its getter, instead of destructuring it from the `params` argument:

```tsx filename="app/[lang]/posts/[slug]/page.tsx" highlight={1,4} switcher
import { lang } from 'next/root-params'

export async function generateStaticParams() {
  const language = await lang()
  const posts = await fetch(
    `https://api.example.com/posts?lang=${language}`
  ).then((res) => res.json())
  return posts.map((post) => ({ slug: post.slug }))
}

export default async function Page() {
  // ...
}
```

```jsx filename="app/[lang]/posts/[slug]/page.js" highlight={1,4} switcher
import { lang } from 'next/root-params'

export async function generateStaticParams() {
  const language = await lang()
  const posts = await fetch(
    `https://api.example.com/posts?lang=${language}`
  ).then((res) => res.json())
  return posts.map((post) => ({ slug: post.slug }))
}

export default async function Page() {
  // ...
}
```

## Root parameters and other route parameters

Root parameters are the route parameters from [dynamic segments](/docs/app/glossary#dynamic-route-segments) that appear in the path up to the root layout file. Other route parameters deeper in the route tree are accessed through the [`params` prop](/docs/app/api-reference/file-conventions/page#params-optional).

Given this file structure:

- `app/[lang]/layout.tsx` (root layout)
- `app/[lang]/posts/[slug]/page.tsx`

Only `lang` is a root parameter. `slug` is a regular route parameter:

```tsx filename="app/[lang]/posts/[slug]/page.tsx" highlight={1,7} switcher
import { lang } from 'next/root-params'

export default async function PostPage(
  props: PageProps<'/[lang]/posts/[slug]'>
) {
  const { slug } = await props.params
  const language = await lang()

  return (
    <article>
      <p>Language: {language}</p>
      <p>Post: {slug}</p>
    </article>
  )
}
```

```jsx filename="app/[lang]/posts/[slug]/page.js" highlight={1,5} switcher
import { lang } from 'next/root-params'

export default async function PostPage({ params }) {
  const { slug } = await params
  const language = await lang()

  return (
    <article>
      <p>Language: {language}</p>
      <p>Post: {slug}</p>
    </article>
  )
}
```

## Accessing root parameters in shared code

Root parameter getters are module imports, they can be called from any Server Component or server-side utility, not just layouts and pages:

```tsx filename="lib/get-translations.ts" highlight={4}
import { lang } from 'next/root-params'

export async function getTranslations() {
  const language = await lang()
  // Load translations based on the root language parameter
  return import(`@/locales/${language}.json`)
}
```

> **Good to know:** You do not need to add `import 'server-only'` to files that use `next/root-params`. The import already fails at build time if used in a Client Component.

## Behavior with caching directives

Because root parameter getters are imported functions, Next.js can track which ones a [cached](/docs/app/api-reference/directives/use-cache) function uses. Only those root parameters become part of the [cache key](/docs/app/api-reference/directives/use-cache#cache-keys), so cache entries are not split across unrelated parameter values.

```tsx filename="app/[lang]/components/cached-nav.tsx" highlight={7} switcher
import { lang } from 'next/root-params'

// The cache key for this function only includes `lang`,
// not every dynamic segment in the route.
async function getNavigation() {
  'use cache'
  const language = await lang()
  const res = await fetch(`https://api.example.com/nav?lang=${language}`)
  return res.json()
}

export default async function CachedNav() {
  const nav = await getNavigation()
  return <nav>{/* render nav items */}</nav>
}
```

```jsx filename="app/[lang]/components/cached-nav.js" highlight={7} switcher
import { lang } from 'next/root-params'

// The cache key for this function only includes `lang`,
// not every dynamic segment in the route.
async function getNavigation() {
  'use cache'
  const language = await lang()
  const res = await fetch(`https://api.example.com/nav?lang=${language}`)
  return res.json()
}

export default async function CachedNav() {
  const nav = await getNavigation()
  return <nav>{/* render nav items */}</nav>
}
```

With the regular `params` prop, you would need to `await params` outside the cached function and pass the value in as an argument:

```tsx filename="app/[lang]/page.tsx" highlight={6,17} switcher
import { lang } from 'next/root-params'

// With root params: call directly inside the cached function
async function getDataWithRootParams() {
  'use cache'
  const language = await lang()
  return fetch(`https://api.example.com/data?lang=${language}`)
}

// Without root params: await params outside, pass as argument
async function getDataWithParams(language: string) {
  'use cache'
  return fetch(`https://api.example.com/data?lang=${language}`)
}

export default async function Page(props: PageProps<'/[lang]'>) {
  const { lang: language } = await props.params
  const data = await getDataWithParams(language)
  // ...
}
```

```jsx filename="app/[lang]/page.js" highlight={6,17} switcher
import { lang } from 'next/root-params'

// With root params: call directly inside the cached function
async function getDataWithRootParams() {
  'use cache'
  const language = await lang()
  return fetch(`https://api.example.com/data?lang=${language}`)
}

// Without root params: await params outside, pass as argument
async function getDataWithParams(language) {
  'use cache'
  return fetch(`https://api.example.com/data?lang=${language}`)
}

export default async function Page({ params }) {
  const { lang: language } = await params
  const data = await getDataWithParams(language)
  // ...
}
```

## Multiple root layouts

When an application has multiple root layouts with different parameters, getter functions are typed to account for usage in any of all possible routes. A parameter that does not exist in every root layout has the type `string | undefined`.

Given this file structure:

- `app/dashboard/[id]/layout.tsx` (root layout with `id`)
- `app/marketing/layout.tsx` (root layout without `id`)

```tsx filename="app/dashboard/[id]/page.tsx" highlight={4} switcher
import { id } from 'next/root-params'

export default async function DashboardPage() {
  const dashboardId = await id() // string | undefined
  return <div>Dashboard: {dashboardId}</div>
}
```

```jsx filename="app/dashboard/[id]/page.js" highlight={4} switcher
import { id } from 'next/root-params'

export default async function DashboardPage() {
  const dashboardId = await id() // string | undefined
  return <div>Dashboard: {dashboardId}</div>
}
```

Since `id` does not exist in the marketing root layout, `await id()` returns `undefined` when accessed from marketing routes.

## Catch-all and optional catch-all segments

Root parameters work with [catch-all and optional catch-all](/docs/app/api-reference/file-conventions/dynamic-routes#catch-all-segments) segments:

```tsx filename="app/docs/[...path]/layout.tsx" highlight={6} switcher
import { path } from 'next/root-params'

export default async function DocsLayout(
  props: LayoutProps<'/docs/[...path]'>
) {
  const segments = await path() // string[] | undefined
  return (
    <div>
      <nav>Path: {segments?.join(' / ')}</nav>
      {props.children}
    </div>
  )
}
```

```jsx filename="app/docs/[...path]/layout.js" highlight={4} switcher
import { path } from 'next/root-params'

export default async function DocsLayout({ children }) {
  const segments = await path() // string[] | undefined
  return (
    <div>
      <nav>Path: {segments?.join(' / ')}</nav>
      {children}
    </div>
  )
}
```

## Returns

Each root parameter getter returns a `Promise` that resolves to one of the following:

| Segment type       | Example       | Return type             |
| ------------------ | ------------- | ----------------------- |
| Dynamic            | `[id]`        | `string`                |
| Catch-all          | `[...path]`   | `string[]`              |
| Optional catch-all | `[[...path]]` | `string[] \| undefined` |

If the parameter does not exist in the current route's root layout (see [Multiple root layouts](#multiple-root-layouts)), the return type includes `undefined`.

## Restrictions

Most of these are permanent constraints of how root parameters work. The exception is [Route Handlers](/docs/app/api-reference/file-conventions/route), which are not supported yet but are planned for a future release.

### Server Components only

Root parameter getters can only be used in Server Components:

```tsx
// This will cause a build error
'use client'

import { lang } from 'next/root-params' // Error: Cannot import in Client Component
```

### Not available in `unstable_cache`

Calling a root parameter getter inside `unstable_cache` will throw a runtime error. Use [`"use cache"`](/docs/app/api-reference/directives/use-cache) instead.

```tsx
import { lang } from 'next/root-params'
import { unstable_cache } from 'next/cache'

const getCachedData = unstable_cache(async () => {
  const language = await lang() // Error: Not supported inside unstable_cache
  return fetch(`https://api.example.com/data?lang=${language}`)
})
```

### Not available in Server Actions

```tsx
import { lang } from 'next/root-params'

async function submitForm() {
  'use server'
  const language = await lang() // Error: Not supported in Server Actions
}
```

## Why root parameters are special

The [root layout](/docs/app/api-reference/file-conventions/layout#root-layout) is the top-level rendering boundary. The route parameters before it are shared by all routes under that root layout, which is what makes them safe to access from any Server Component in that tree. Route parameters deeper in the route vary depending on which child page is being rendered, so they are only available through the [`params` prop](/docs/app/api-reference/file-conventions/page#params-optional) in the page or layout that defines them.

```txt
app/
  [lang]/              ← root parameter (shared by all routes below)
    layout.tsx         ← root layout
    page.tsx           ← has no slug, doesn't know about blog or store
    blog/
      [slug]/          ← route parameter
        page.tsx
    store/
      [...slug]/       ← catch-all route parameter with the same name
        page.tsx
```

In this example, `lang` is the only root parameter. The `page.tsx` directly under the root layout has no `slug` at all. The blog and store branches both define `slug`, but with different segment types (`[slug]` vs `[...slug]`). Each route only knows about its own route parameters. The same name can have different types, different meanings, or not exist at all depending on the route. This is why route parameters below the root layout are accessed through the `params` prop rather than as global getters.

The exception is [multiple root layouts](#multiple-root-layouts). When different root layouts define different route parameters, the getter functions include `undefined` in their return type to account for routes where a given parameter may not exist.

## Version History

| Version   | Changes                        |
| --------- | ------------------------------ |
| `v16.3.0` | `next/root-params` introduced. |
