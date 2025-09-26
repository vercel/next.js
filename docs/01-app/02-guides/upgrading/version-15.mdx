---
title: How to upgrade to version 15
nav_title: Version 15
description: Upgrade your Next.js Application from Version 14 to 15.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

## Upgrading from 14 to 15

To update to Next.js version 15, you can use the `upgrade` codemod:

```bash filename="Terminal"
npx @next/codemod@canary upgrade latest
```

If you prefer to do it manually, ensure that you're installing the latest Next & React versions:

```bash filename="Terminal"
npm i next@latest react@latest react-dom@latest eslint-config-next@latest
```

> **Good to know:**
>
> - If you see a peer dependencies warning, you may need to update `react` and `react-dom` to the suggested versions, or use the `--force` or `--legacy-peer-deps` flag to ignore the warning. This won't be necessary once both Next.js 15 and React 19 are stable.

## React 19

- The minimum versions of `react` and `react-dom` is now 19.
- `useFormState` has been replaced by `useActionState`. The `useFormState` hook is still available in React 19, but it is deprecated and will be removed in a future release. `useActionState` is recommended and includes additional properties like reading the `pending` state directly. [Learn more](https://react.dev/reference/react/useActionState).
- `useFormStatus` now includes additional keys like `data`, `method`, and `action`. If you are not using React 19, only the `pending` key is available. [Learn more](https://react.dev/reference/react-dom/hooks/useFormStatus).
- Read more in the [React 19 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide).

> **Good to know:** If you are using TypeScript, ensure you also upgrade `@types/react` and `@types/react-dom` to their latest versions.

## Async Request APIs (Breaking change)

Previously synchronous Dynamic APIs that rely on runtime information are now **asynchronous**:

- [`cookies`](/docs/app/api-reference/functions/cookies)
- [`headers`](/docs/app/api-reference/functions/headers)
- [`draftMode`](/docs/app/api-reference/functions/draft-mode)
- `params` in [`layout.js`](/docs/app/api-reference/file-conventions/layout), [`page.js`](/docs/app/api-reference/file-conventions/page), [`route.js`](/docs/app/api-reference/file-conventions/route), [`default.js`](/docs/app/api-reference/file-conventions/default), [`opengraph-image`](/docs/app/api-reference/file-conventions/metadata/opengraph-image), [`twitter-image`](/docs/app/api-reference/file-conventions/metadata/opengraph-image), [`icon`](/docs/app/api-reference/file-conventions/metadata/app-icons), and [`apple-icon`](/docs/app/api-reference/file-conventions/metadata/app-icons).
- `searchParams` in [`page.js`](/docs/app/api-reference/file-conventions/page)

To ease the burden of migration, a [codemod is available](/docs/app/guides/upgrading/codemods#150) to automate the process and the APIs can temporarily be accessed synchronously.

### `cookies`

#### Recommended Async Usage

```tsx
import { cookies } from 'next/headers'

// Before
const cookieStore = cookies()
const token = cookieStore.get('token')

// After
const cookieStore = await cookies()
const token = cookieStore.get('token')
```

#### Temporary Synchronous Usage

```tsx filename="app/page.tsx" switcher
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'

// Before
const cookieStore = cookies()
const token = cookieStore.get('token')

// After
const cookieStore = cookies() as unknown as UnsafeUnwrappedCookies
// will log a warning in dev
const token = cookieStore.get('token')
```

```jsx filename="app/page.js" switcher
import { cookies } from 'next/headers'

// Before
const cookieStore = cookies()
const token = cookieStore.get('token')

// After
const cookieStore = cookies()
// will log a warning in dev
const token = cookieStore.get('token')
```

### `headers`

#### Recommended Async Usage

```tsx
import { headers } from 'next/headers'

// Before
const headersList = headers()
const userAgent = headersList.get('user-agent')

// After
const headersList = await headers()
const userAgent = headersList.get('user-agent')
```

#### Temporary Synchronous Usage

```tsx filename="app/page.tsx" switcher
import { headers, type UnsafeUnwrappedHeaders } from 'next/headers'

// Before
const headersList = headers()
const userAgent = headersList.get('user-agent')

// After
const headersList = headers() as unknown as UnsafeUnwrappedHeaders
// will log a warning in dev
const userAgent = headersList.get('user-agent')
```

```jsx filename="app/page.js" switcher
import { headers } from 'next/headers'

// Before
const headersList = headers()
const userAgent = headersList.get('user-agent')

// After
const headersList = headers()
// will log a warning in dev
const userAgent = headersList.get('user-agent')
```

### `draftMode`

#### Recommended Async Usage

```tsx
import { draftMode } from 'next/headers'

// Before
const { isEnabled } = draftMode()

// After
const { isEnabled } = await draftMode()
```

#### Temporary Synchronous Usage

```tsx filename="app/page.tsx" switcher
import { draftMode, type UnsafeUnwrappedDraftMode } from 'next/headers'

// Before
const { isEnabled } = draftMode()

// After
// will log a warning in dev
const { isEnabled } = draftMode() as unknown as UnsafeUnwrappedDraftMode
```

```jsx filename="app/page.js" switcher
import { draftMode } from 'next/headers'

// Before
const { isEnabled } = draftMode()

// After
// will log a warning in dev
const { isEnabled } = draftMode()
```

### `params` & `searchParams`

#### Asynchronous Layout

```tsx filename="app/layout.tsx" switcher
// Before
type Params = { slug: string }

export function generateMetadata({ params }: { params: Params }) {
  const { slug } = params
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Params
}) {
  const { slug } = params
}

// After
type Params = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Params
}) {
  const { slug } = await params
}
```

```jsx filename="app/layout.js" switcher
// Before
export function generateMetadata({ params }) {
  const { slug } = params
}

export default async function Layout({ children, params }) {
  const { slug } = params
}

// After
export async function generateMetadata({ params }) {
  const { slug } = await params
}

export default async function Layout({ children, params }) {
  const { slug } = await params
}
```

#### Synchronous Layout

```tsx filename="app/layout.tsx" switcher
// Before
type Params = { slug: string }

export default function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Params
}) {
  const { slug } = params
}

// After
import { use } from 'react'

type Params = Promise<{ slug: string }>

export default function Layout(props: {
  children: React.ReactNode
  params: Params
}) {
  const params = use(props.params)
  const slug = params.slug
}
```

```jsx filename="app/layout.js" switcher
// Before
export default function Layout({ children, params }) {
  const { slug } = params
}

// After
import { use } from 'react'
export default async function Layout(props) {
  const params = use(props.params)
  const slug = params.slug
}

```

#### Asynchronous Page

```tsx filename="app/page.tsx" switcher
// Before
type Params = { slug: string }
type SearchParams = { [key: string]: string | string[] | undefined }

export function generateMetadata({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { slug } = params
  const { query } = searchParams
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { slug } = params
  const { query } = searchParams
}

// After
type Params = Promise<{ slug: string }>
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export async function generateMetadata(props: {
  params: Params
  searchParams: SearchParams
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const slug = params.slug
  const query = searchParams.query
}

export default async function Page(props: {
  params: Params
  searchParams: SearchParams
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const slug = params.slug
  const query = searchParams.query
}
```

```jsx filename="app/page.js" switcher
// Before
export function generateMetadata({ params, searchParams }) {
  const { slug } = params
  const { query } = searchParams
}

export default function Page({ params, searchParams }) {
  const { slug } = params
  const { query } = searchParams
}

// After
export async function generateMetadata(props) {
  const params = await props.params
  const searchParams = await props.searchParams
  const slug = params.slug
  const query = searchParams.query
}

export async function Page(props) {
  const params = await props.params
  const searchParams = await props.searchParams
  const slug = params.slug
  const query = searchParams.query
}
```

#### Synchronous Page

```tsx
'use client'

// Before
type Params = { slug: string }
type SearchParams = { [key: string]: string | string[] | undefined }

export default function Page({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { slug } = params
  const { query } = searchParams
}

// After
import { use } from 'react'

type Params = Promise<{ slug: string }>
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default function Page(props: {
  params: Params
  searchParams: SearchParams
}) {
  const params = use(props.params)
  const searchParams = use(props.searchParams)
  const slug = params.slug
  const query = searchParams.query
}
```

```jsx
// Before
export default function Page({ params, searchParams }) {
  const { slug } = params
  const { query } = searchParams
}

// After
import { use } from "react"

export default function Page(props) {
  const params = use(props.params)
  const searchParams = use(props.searchParams)
  const slug = params.slug
  const query = searchParams.query
}

```

#### Route Handlers

```tsx filename="app/api/route.ts" switcher
// Before
type Params = { slug: string }

export async function GET(request: Request, segmentData: { params: Params }) {
  const params = segmentData.params
  const slug = params.slug
}

// After
type Params = Promise<{ slug: string }>

export async function GET(request: Request, segmentData: { params: Params }) {
  const params = await segmentData.params
  const slug = params.slug
}
```

```js filename="app/api/route.js" switcher
// Before
export async function GET(request, segmentData) {
  const params = segmentData.params
  const slug = params.slug
}

// After
export async function GET(request, segmentData) {
  const params = await segmentData.params
  const slug = params.slug
}
```

<AppOnly>

## `runtime` configuration (Breaking change)

The `runtime` [segment configuration](/docs/app/api-reference/file-conventions/route-segment-config#runtime) previously supported a value of `experimental-edge` in addition to `edge`. Both configurations refer to the same thing, and to simplify the options, we will now error if `experimental-edge` is used. To fix this, update your `runtime` configuration to `edge`. A [codemod](/docs/app/guides/upgrading/codemods#app-dir-runtime-config-experimental-edge) is available to automatically do this.

</AppOnly>

## `fetch` requests

[`fetch` requests](/docs/app/api-reference/functions/fetch) are no longer cached by default.

To opt specific `fetch` requests into caching, you can pass the `cache: 'force-cache'` option.

```js filename="app/layout.js"
export default async function RootLayout() {
  const a = await fetch('https://...') // Not Cached
  const b = await fetch('https://...', { cache: 'force-cache' }) // Cached

  // ...
}
```

To opt all `fetch` requests in a layout or page into caching, you can use the `export const fetchCache = 'default-cache'` [segment config option](/docs/app/api-reference/file-conventions/route-segment-config). If individual `fetch` requests specify a `cache` option, that will be used instead.

```js filename="app/layout.js"
// Since this is the root layout, all fetch requests in the app
// that don't set their own cache option will be cached.
export const fetchCache = 'default-cache'

export default async function RootLayout() {
  const a = await fetch('https://...') // Cached
  const b = await fetch('https://...', { cache: 'no-store' }) // Not cached

  // ...
}
```

## Route Handlers

`GET` functions in [Route Handlers](/docs/app/api-reference/file-conventions/route) are no longer cached by default. To opt `GET` methods into caching, you can use a [route config option](/docs/app/api-reference/file-conventions/route-segment-config) such as `export const dynamic = 'force-static'` in your Route Handler file.

```js filename="app/api/route.js"
export const dynamic = 'force-static'

export async function GET() {}
```

## Client-side Router Cache

When navigating between pages via `<Link>` or `useRouter`, [page](/docs/app/api-reference/file-conventions/page) segments are no longer reused from the client-side router cache. However, they are still reused during browser backward and forward navigation and for shared layouts.

To opt page segments into caching, you can use the [`staleTimes`](/docs/app/api-reference/config/next-config-js/staleTimes) config option:

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
}

module.exports = nextConfig
```

[Layouts](/docs/app/api-reference/file-conventions/layout) and [loading states](/docs/app/api-reference/file-conventions/loading) are still cached and reused on navigation.

## `next/font`

The `@next/font` package has been removed in favor of the built-in [`next/font`](/docs/app/api-reference/components/font). A [codemod is available](/docs/app/guides/upgrading/codemods#built-in-next-font) to safely and automatically rename your imports.

```js filename="app/layout.js"
// Before
import { Inter } from '@next/font/google'

// After
import { Inter } from 'next/font/google'
```

## bundlePagesRouterDependencies

`experimental.bundlePagesExternals` is now stable and renamed to `bundlePagesRouterDependencies`.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Before
  experimental: {
    bundlePagesExternals: true,
  },

  // After
  bundlePagesRouterDependencies: true,
}

module.exports = nextConfig
```

## serverExternalPackages

`experimental.serverComponentsExternalPackages` is now stable and renamed to `serverExternalPackages`.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Before
  experimental: {
    serverComponentsExternalPackages: ['package-name'],
  },

  // After
  serverExternalPackages: ['package-name'],
}

module.exports = nextConfig
```

## Speed Insights

Auto instrumentation for Speed Insights was removed in Next.js 15.

To continue using Speed Insights, follow the [Vercel Speed Insights Quickstart](https://vercel.com/docs/speed-insights/quickstart) guide.

## `NextRequest` Geolocation

The `geo` and `ip` properties on `NextRequest` have been removed as these values are provided by your hosting provider. A [codemod](/docs/app/guides/upgrading/codemods#150) is available to automate this migration.

If you are using Vercel, you can alternatively use the `geolocation` and `ipAddress` functions from [`@vercel/functions`](https://vercel.com/docs/functions/vercel-functions-package) instead:

```ts filename="middleware.ts"
import { geolocation } from '@vercel/functions'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { city } = geolocation(request)

  // ...
}
```

```ts filename="middleware.ts"
import { ipAddress } from '@vercel/functions'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const ip = ipAddress(request)

  // ...
}
```
