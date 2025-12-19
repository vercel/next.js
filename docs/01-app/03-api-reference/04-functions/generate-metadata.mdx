---
title: generateMetadata
description: Learn how to add Metadata to your Next.js application for improved search engine optimization (SEO) and web shareability.
related:
  title: Next Steps
  description: View all the Metadata API options.
  links:
    - app/api-reference/file-conventions/metadata
    - app/api-reference/functions/generate-viewport
---

You can use the `metadata` object or the `generateMetadata` function to define metadata.

## The `metadata` object

To define static metadata, export a [`Metadata` object](#metadata-fields) from a `layout.js` or `page.js` file.

```tsx filename="layout.tsx | page.tsx" switcher
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '...',
  description: '...',
}

export default function Page() {}
```

```jsx filename="layout.js | page.js" switcher
export const metadata = {
  title: '...',
  description: '...',
}

export default function Page() {}
```

> See the [Metadata Fields](#metadata-fields) for a complete list of supported options.

## `generateMetadata` function

Dynamic metadata depends on **dynamic information**, such as the current route parameters, external data, or `metadata` in parent segments, can be set by exporting a `generateMetadata` function that returns a [`Metadata` object](#metadata-fields).

Resolving `generateMetadata` is part of rendering the page. If the page can be pre-rendered and `generateMetadata` doesn't introduce dynamic behavior, the resulting metadata is included in the page’s initial HTML.

Otherwise the metadata resolved from `generateMetadata` [can be streamed](/docs/app/api-reference/functions/generate-metadata#streaming-metadata) after sending the initial UI.

```tsx filename="app/products/[id]/page.tsx" switcher
import type { Metadata, ResolvingMetadata } from 'next'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(
  { params, searchParams }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  // read route params
  const { id } = await params

  // fetch data
  const product = await fetch(`https://.../${id}`).then((res) => res.json())

  // optionally access and extend (rather than replace) parent metadata
  const previousImages = (await parent).openGraph?.images || []

  return {
    title: product.title,
    openGraph: {
      images: ['/some-specific-page-image.jpg', ...previousImages],
    },
  }
}

export default function Page({ params, searchParams }: Props) {}
```

```jsx filename="app/products/[id]/page.js" switcher
export async function generateMetadata({ params, searchParams }, parent) {
  // read route params
  const { id } = await params

  // fetch data
  const product = await fetch(`https://.../${id}`).then((res) => res.json())

  // optionally access and extend (rather than replace) parent metadata
  const previousImages = (await parent).openGraph?.images || []

  return {
    title: product.title,
    openGraph: {
      images: ['/some-specific-page-image.jpg', ...previousImages],
    },
  }
}

export default function Page({ params, searchParams }) {}
```

For type completion of `params` and `searchParams`, you can type the first argument with [`PageProps<'/route'>`](/docs/app/api-reference/file-conventions/page#page-props-helper) or [`LayoutProps<'/route'>`](/docs/app/api-reference/file-conventions/layout#layout-props-helper) for pages and layouts respectively.

> **Good to know**:
>
> - Metadata can be added to `layout.js` and `page.js` files.
> - Next.js will automatically resolve the metadata, and create the relevant `<head>` tags for the page.
> - The `metadata` object and `generateMetadata` function exports are **only supported in Server Components**.
> - You cannot export both the `metadata` object and `generateMetadata` function from the same route segment.
> - `fetch` requests inside `generateMetadata` are automatically [memoized](/docs/app/guides/caching#request-memoization) for the same data across `generateMetadata`, `generateStaticParams`, Layouts, Pages, and Server Components.
> - React [`cache` can be used](/docs/app/guides/caching#react-cache-function) if `fetch` is unavailable.
> - [File-based metadata](/docs/app/api-reference/file-conventions/metadata) has the higher priority and will override the `metadata` object and `generateMetadata` function.

## Reference

### Parameters

`generateMetadata` function accepts the following parameters:

- `props` - An object containing the parameters of the current route:
  - `params` - An object containing the [dynamic route parameters](/docs/app/api-reference/file-conventions/dynamic-routes) object from the root segment down to the segment `generateMetadata` is called from. Examples:

    | Route                           | URL         | `params`                  |
    | ------------------------------- | ----------- | ------------------------- |
    | `app/shop/[slug]/page.js`       | `/shop/1`   | `{ slug: '1' }`           |
    | `app/shop/[tag]/[item]/page.js` | `/shop/1/2` | `{ tag: '1', item: '2' }` |
    | `app/shop/[...slug]/page.js`    | `/shop/1/2` | `{ slug: ['1', '2'] }`    |

  - `searchParams` - An object containing the current URL's [search params](https://developer.mozilla.org/docs/Learn/Common_questions/What_is_a_URL#parameters). Examples:

    | URL             | `searchParams`       |
    | --------------- | -------------------- |
    | `/shop?a=1`     | `{ a: '1' }`         |
    | `/shop?a=1&b=2` | `{ a: '1', b: '2' }` |
    | `/shop?a=1&a=2` | `{ a: ['1', '2'] }`  |

- `parent` - A promise of the resolved metadata from parent route segments.

### Returns

`generateMetadata` should return a [`Metadata` object](#metadata-fields) containing one or more metadata fields.

> **Good to know**:
>
> - If metadata doesn't depend on runtime information, it should be defined using the static [`metadata` object](#the-metadata-object) rather than `generateMetadata`.
> - `fetch` requests are automatically [memoized](/docs/app/guides/caching#request-memoization) for the same data across `generateMetadata`, `generateStaticParams`, Layouts, Pages, and Server Components. React [`cache` can be used](/docs/app/guides/caching#react-cache-function) if `fetch` is unavailable.
> - `searchParams` are only available in `page.js` segments.
> - The [`redirect()`](/docs/app/api-reference/functions/redirect) and [`notFound()`](/docs/app/api-reference/functions/not-found) Next.js methods can also be used inside `generateMetadata`.

### Metadata Fields

The following fields are supported:

#### `title`

The `title` attribute is used to set the title of the document. It can be defined as a simple [string](#string) or an optional [template object](#template).

##### String

```jsx filename="layout.js | page.js"
export const metadata = {
  title: 'Next.js',
}
```

```html filename="<head> output" hideLineNumbers
<title>Next.js</title>
```

##### `default`

`title.default` can be used to provide a **fallback title** to child route segments that don't define a `title`.

```tsx filename="app/layout.tsx"
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Acme',
  },
}
```

```tsx filename="app/about/page.tsx"
import type { Metadata } from 'next'

export const metadata: Metadata = {}

// Output: <title>Acme</title>
```

##### `template`

`title.template` can be used to add a prefix or a suffix to `titles` defined in **child** route segments.

```tsx filename="app/layout.tsx" switcher
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | Acme',
    default: 'Acme', // a default is required when creating a template
  },
}
```

```jsx filename="app/layout.js" switcher
export const metadata = {
  title: {
    template: '%s | Acme',
    default: 'Acme', // a default is required when creating a template
  },
}
```

```tsx filename="app/about/page.tsx" switcher
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
}

// Output: <title>About | Acme</title>
```

```jsx filename="app/about/page.js" switcher
export const metadata = {
  title: 'About',
}

// Output: <title>About | Acme</title>
```

> **Good to know**:
>
> - `title.template` applies to **child** route segments and **not** the segment it's defined in. This means:
>   - `title.default` is **required** when you add a `title.template`.
>   - `title.template` defined in `layout.js` will not apply to a `title` defined in a `page.js` of the same route segment.
>   - `title.template` defined in `page.js` has no effect because a page is always the terminating segment (it doesn't have any children route segments).
> - `title.template` has **no effect** if a route has not defined a `title` or `title.default`.

##### `absolute`

`title.absolute` can be used to provide a title that **ignores** `title.template` set in parent segments.

```tsx filename="app/layout.tsx" switcher
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | Acme',
  },
}
```

```jsx filename="app/layout.js" switcher
export const metadata = {
  title: {
    template: '%s | Acme',
  },
}
```

```tsx filename="app/about/page.tsx" switcher
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    absolute: 'About',
  },
}

// Output: <title>About</title>
```

```jsx filename="app/about/page.js" switcher
export const metadata = {
  title: {
    absolute: 'About',
  },
}

// Output: <title>About</title>
```

> **Good to know**:
>
> - `layout.js`
>   - `title` (string) and `title.default` define the default title for child segments (that do not define their own `title`). It will augment `title.template` from the closest parent segment if it exists.
>   - `title.absolute` defines the default title for child segments. It ignores `title.template` from parent segments.
>   - `title.template` defines a new title template for child segments.
> - `page.js`
>   - If a page does not define its own title the closest parents resolved title will be used.
>   - `title` (string) defines the routes title. It will augment `title.template` from the closest parent segment if it exists.
>   - `title.absolute` defines the route title. It ignores `title.template` from parent segments.
>   - `title.template` has no effect in `page.js` because a page is always the terminating segment of a route.

### `description`

```jsx filename="layout.js | page.js"
export const metadata = {
  description: 'The React Framework for the Web',
}
```

```html filename="<head> output" hideLineNumbers
<meta name="description" content="The React Framework for the Web" />
```

### Other fields

```jsx filename="layout.js | page.js"
export const metadata = {
  generator: 'Next.js',
  applicationName: 'Next.js',
  referrer: 'origin-when-cross-origin',
  keywords: ['Next.js', 'React', 'JavaScript'],
  authors: [{ name: 'Seb' }, { name: 'Josh', url: 'https://nextjs.org' }],
  creator: 'Jiachi Liu',
  publisher: 'Sebastian Markbåge',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta name="application-name" content="Next.js" />
<meta name="author" content="Seb" />
<link rel="author" href="https://nextjs.org" />
<meta name="author" content="Josh" />
<meta name="generator" content="Next.js" />
<meta name="keywords" content="Next.js,React,JavaScript" />
<meta name="referrer" content="origin-when-cross-origin" />
<meta name="color-scheme" content="dark" />
<meta name="creator" content="Jiachi Liu" />
<meta name="publisher" content="Sebastian Markbåge" />
<meta name="format-detection" content="telephone=no, address=no, email=no" />
```

#### `metadataBase`

`metadataBase` is a convenience option to set a base URL prefix for `metadata` fields that require a fully qualified URL.

- `metadataBase` allows URL-based `metadata` fields defined in the **current route segment and below** to use a **relative path** instead of an otherwise required absolute URL.
- The field's relative path will be composed with `metadataBase` to form a fully qualified URL.

```jsx filename="layout.js | page.js"
export const metadata = {
  metadataBase: new URL('https://acme.com'),
  alternates: {
    canonical: '/',
    languages: {
      'en-US': '/en-US',
      'de-DE': '/de-DE',
    },
  },
  openGraph: {
    images: '/og-image.png',
  },
}
```

```html filename="<head> output" hideLineNumbers
<link rel="canonical" href="https://acme.com" />
<link rel="alternate" hreflang="en-US" href="https://acme.com/en-US" />
<link rel="alternate" hreflang="de-DE" href="https://acme.com/de-DE" />
<meta property="og:image" content="https://acme.com/og-image.png" />
```

> **Good to know**:
>
> - `metadataBase` is typically set in root `app/layout.js` to apply to URL-based `metadata` fields across all routes.
> - All URL-based `metadata` fields that require absolute URLs can be configured with a `metadataBase` option.
> - `metadataBase` can contain a subdomain e.g. `https://app.acme.com` or base path e.g. `https://acme.com/start/from/here`
> - If a `metadata` field provides an absolute URL, `metadataBase` will be ignored.
> - Using a relative path in a URL-based `metadata` field without configuring a `metadataBase` will cause a build error.
> - Next.js will normalize duplicate slashes between `metadataBase` (e.g. `https://acme.com/`) and a relative field (e.g. `/path`) to a single slash (e.g. `https://acme.com/path`)

#### URL Composition

URL composition favors developer intent over default directory traversal semantics.

- Trailing slashes between `metadataBase` and `metadata` fields are normalized.
- An "absolute" path in a `metadata` field (that typically would replace the whole URL path) is treated as a "relative" path (starting from the end of `metadataBase`).

For example, given the following `metadataBase`:

```tsx filename="app/layout.tsx" switcher
import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://acme.com'),
}
```

```jsx filename="app/layout.js" switcher
export const metadata = {
  metadataBase: new URL('https://acme.com'),
}
```

Any `metadata` fields that inherit the above `metadataBase` and set their own value will be resolved as follows:

| `metadata` field                 | Resolved URL                     |
| -------------------------------- | -------------------------------- |
| `/`                              | `https://acme.com`               |
| `./`                             | `https://acme.com`               |
| `payments`                       | `https://acme.com/payments`      |
| `/payments`                      | `https://acme.com/payments`      |
| `./payments`                     | `https://acme.com/payments`      |
| `../payments`                    | `https://acme.com/payments`      |
| `https://beta.acme.com/payments` | `https://beta.acme.com/payments` |

### `openGraph`

```jsx filename="layout.js | page.js"
export const metadata = {
  openGraph: {
    title: 'Next.js',
    description: 'The React Framework for the Web',
    url: 'https://nextjs.org',
    siteName: 'Next.js',
    images: [
      {
        url: 'https://nextjs.org/og.png', // Must be an absolute URL
        width: 800,
        height: 600,
      },
      {
        url: 'https://nextjs.org/og-alt.png', // Must be an absolute URL
        width: 1800,
        height: 1600,
        alt: 'My custom alt',
      },
    ],
    videos: [
      {
        url: 'https://nextjs.org/video.mp4', // Must be an absolute URL
        width: 800,
        height: 600,
      },
    ],
    audio: [
      {
        url: 'https://nextjs.org/audio.mp3', // Must be an absolute URL
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta property="og:title" content="Next.js" />
<meta property="og:description" content="The React Framework for the Web" />
<meta property="og:url" content="https://nextjs.org/" />
<meta property="og:site_name" content="Next.js" />
<meta property="og:locale" content="en_US" />
<meta property="og:image" content="https://nextjs.org/og.png" />
<meta property="og:image:width" content="800" />
<meta property="og:image:height" content="600" />
<meta property="og:image" content="https://nextjs.org/og-alt.png" />
<meta property="og:image:width" content="1800" />
<meta property="og:image:height" content="1600" />
<meta property="og:image:alt" content="My custom alt" />
<meta property="og:video" content="https://nextjs.org/video.mp4" />
<meta property="og:video:width" content="800" />
<meta property="og:video:height" content="600" />
<meta property="og:audio" content="https://nextjs.org/audio.mp3" />
<meta property="og:type" content="website" />
```

```jsx filename="layout.js | page.js"
export const metadata = {
  openGraph: {
    title: 'Next.js',
    description: 'The React Framework for the Web',
    type: 'article',
    publishedTime: '2023-01-01T00:00:00.000Z',
    authors: ['Seb', 'Josh'],
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta property="og:title" content="Next.js" />
<meta property="og:description" content="The React Framework for the Web" />
<meta property="og:type" content="article" />
<meta property="article:published_time" content="2023-01-01T00:00:00.000Z" />
<meta property="article:author" content="Seb" />
<meta property="article:author" content="Josh" />
```

> **Good to know**:
>
> - It may be more convenient to use the [file-based Metadata API](/docs/app/api-reference/file-conventions/metadata/opengraph-image#image-files-jpg-png-gif) for Open Graph images. Rather than having to sync the config export with actual files, the file-based API will automatically generate the correct metadata for you.

### `robots`

```tsx filename="layout.tsx | page.tsx"
import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta name="robots" content="index, follow" />
<meta
  name="googlebot"
  content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1"
/>
```

### `icons`

> **Good to know**: We recommend using the [file-based Metadata API](/docs/app/api-reference/file-conventions/metadata/app-icons#image-files-ico-jpg-png) for icons where possible. Rather than having to sync the config export with actual files, the file-based API will automatically generate the correct metadata for you.

```jsx filename="layout.js | page.js"
export const metadata = {
  icons: {
    icon: '/icon.png',
    shortcut: '/shortcut-icon.png',
    apple: '/apple-icon.png',
    other: {
      rel: 'apple-touch-icon-precomposed',
      url: '/apple-touch-icon-precomposed.png',
    },
  },
}
```

```html filename="<head> output" hideLineNumbers
<link rel="shortcut icon" href="/shortcut-icon.png" />
<link rel="icon" href="/icon.png" />
<link rel="apple-touch-icon" href="/apple-icon.png" />
<link
  rel="apple-touch-icon-precomposed"
  href="/apple-touch-icon-precomposed.png"
/>
```

```jsx filename="layout.js | page.js"
export const metadata = {
  icons: {
    icon: [
      { url: '/icon.png' },
      new URL('/icon.png', 'https://example.com'),
      { url: '/icon-dark.png', media: '(prefers-color-scheme: dark)' },
    ],
    shortcut: ['/shortcut-icon.png'],
    apple: [
      { url: '/apple-icon.png' },
      { url: '/apple-icon-x3.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'apple-touch-icon-precomposed',
        url: '/apple-touch-icon-precomposed.png',
      },
    ],
  },
}
```

```html filename="<head> output" hideLineNumbers
<link rel="shortcut icon" href="/shortcut-icon.png" />
<link rel="icon" href="/icon.png" />
<link rel="icon" href="https://example.com/icon.png" />
<link rel="icon" href="/icon-dark.png" media="(prefers-color-scheme: dark)" />
<link rel="apple-touch-icon" href="/apple-icon.png" />
<link
  rel="apple-touch-icon-precomposed"
  href="/apple-touch-icon-precomposed.png"
/>
<link
  rel="apple-touch-icon"
  href="/apple-icon-x3.png"
  sizes="180x180"
  type="image/png"
/>
```

> **Good to know**: The `msapplication-*` meta tags are no longer supported in Chromium builds of Microsoft Edge, and thus no longer needed.

### `themeColor`

> **Deprecated**: The `themeColor` option in `metadata` is deprecated as of Next.js 14. Please use the [`viewport` configuration](/docs/app/api-reference/functions/generate-viewport) instead.

### `colorScheme`

> **Deprecated**: The `colorScheme` option in `metadata` is deprecated as of Next.js 14. Please use the [`viewport` configuration](/docs/app/api-reference/functions/generate-viewport) instead.

### `manifest`

A web application manifest, as defined in the [Web Application Manifest specification](https://developer.mozilla.org/docs/Web/Manifest).

```jsx filename="layout.js | page.js"
export const metadata = {
  manifest: 'https://nextjs.org/manifest.json',
}
```

```html filename="<head> output" hideLineNumbers
<link rel="manifest" href="https://nextjs.org/manifest.json" />
```

### `twitter`

The Twitter specification is (surprisingly) used for more than just X (formerly known as Twitter).

Learn more about the [Twitter Card markup reference](https://developer.x.com/en/docs/twitter-for-websites/cards/overview/markup).

```jsx filename="layout.js | page.js"
export const metadata = {
  twitter: {
    card: 'summary_large_image',
    title: 'Next.js',
    description: 'The React Framework for the Web',
    siteId: '1467726470533754880',
    creator: '@nextjs',
    creatorId: '1467726470533754880',
    images: ['https://nextjs.org/og.png'], // Must be an absolute URL
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site:id" content="1467726470533754880" />
<meta name="twitter:creator" content="@nextjs" />
<meta name="twitter:creator:id" content="1467726470533754880" />
<meta name="twitter:title" content="Next.js" />
<meta name="twitter:description" content="The React Framework for the Web" />
<meta name="twitter:image" content="https://nextjs.org/og.png" />
```

```jsx filename="layout.js | page.js"
export const metadata = {
  twitter: {
    card: 'app',
    title: 'Next.js',
    description: 'The React Framework for the Web',
    siteId: '1467726470533754880',
    creator: '@nextjs',
    creatorId: '1467726470533754880',
    images: {
      url: 'https://nextjs.org/og.png',
      alt: 'Next.js Logo',
    },
    app: {
      name: 'twitter_app',
      id: {
        iphone: 'twitter_app://iphone',
        ipad: 'twitter_app://ipad',
        googleplay: 'twitter_app://googleplay',
      },
      url: {
        iphone: 'https://iphone_url',
        ipad: 'https://ipad_url',
      },
    },
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta name="twitter:site:id" content="1467726470533754880" />
<meta name="twitter:creator" content="@nextjs" />
<meta name="twitter:creator:id" content="1467726470533754880" />
<meta name="twitter:title" content="Next.js" />
<meta name="twitter:description" content="The React Framework for the Web" />
<meta name="twitter:card" content="app" />
<meta name="twitter:image" content="https://nextjs.org/og.png" />
<meta name="twitter:image:alt" content="Next.js Logo" />
<meta name="twitter:app:name:iphone" content="twitter_app" />
<meta name="twitter:app:id:iphone" content="twitter_app://iphone" />
<meta name="twitter:app:id:ipad" content="twitter_app://ipad" />
<meta name="twitter:app:id:googleplay" content="twitter_app://googleplay" />
<meta name="twitter:app:url:iphone" content="https://iphone_url" />
<meta name="twitter:app:url:ipad" content="https://ipad_url" />
<meta name="twitter:app:name:ipad" content="twitter_app" />
<meta name="twitter:app:name:googleplay" content="twitter_app" />
```

### `viewport`

> **Deprecated**: The `viewport` option in `metadata` is deprecated as of Next.js 14. Please use the [`viewport` configuration](/docs/app/api-reference/functions/generate-viewport) instead.

### `verification`

```jsx filename="layout.js | page.js"
export const metadata = {
  verification: {
    google: 'google',
    yandex: 'yandex',
    yahoo: 'yahoo',
    other: {
      me: ['my-email', 'my-link'],
    },
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta name="google-site-verification" content="google" />
<meta name="y_key" content="yahoo" />
<meta name="yandex-verification" content="yandex" />
<meta name="me" content="my-email" />
<meta name="me" content="my-link" />
```

### `appleWebApp`

```jsx filename="layout.js | page.js"
export const metadata = {
  itunes: {
    appId: 'myAppStoreID',
    appArgument: 'myAppArgument',
  },
  appleWebApp: {
    title: 'Apple Web App',
    statusBarStyle: 'black-translucent',
    startupImage: [
      '/assets/startup/apple-touch-startup-image-768x1004.png',
      {
        url: '/assets/startup/apple-touch-startup-image-1536x2008.png',
        media: '(device-width: 768px) and (device-height: 1024px)',
      },
    ],
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta
  name="apple-itunes-app"
  content="app-id=myAppStoreID, app-argument=myAppArgument"
/>
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Apple Web App" />
<link
  href="/assets/startup/apple-touch-startup-image-768x1004.png"
  rel="apple-touch-startup-image"
/>
<link
  href="/assets/startup/apple-touch-startup-image-1536x2008.png"
  media="(device-width: 768px) and (device-height: 1024px)"
  rel="apple-touch-startup-image"
/>
<meta
  name="apple-mobile-web-app-status-bar-style"
  content="black-translucent"
/>
```

### `alternates`

```jsx filename="layout.js | page.js"
export const metadata = {
  alternates: {
    canonical: 'https://nextjs.org',
    languages: {
      'en-US': 'https://nextjs.org/en-US',
      'de-DE': 'https://nextjs.org/de-DE',
    },
    media: {
      'only screen and (max-width: 600px)': 'https://nextjs.org/mobile',
    },
    types: {
      'application/rss+xml': 'https://nextjs.org/rss',
    },
  },
}
```

```html filename="<head> output" hideLineNumbers
<link rel="canonical" href="https://nextjs.org" />
<link rel="alternate" hreflang="en-US" href="https://nextjs.org/en-US" />
<link rel="alternate" hreflang="de-DE" href="https://nextjs.org/de-DE" />
<link
  rel="alternate"
  media="only screen and (max-width: 600px)"
  href="https://nextjs.org/mobile"
/>
<link
  rel="alternate"
  type="application/rss+xml"
  href="https://nextjs.org/rss"
/>
```

### `appLinks`

```jsx filename="layout.js | page.js"
export const metadata = {
  appLinks: {
    ios: {
      url: 'https://nextjs.org/ios',
      app_store_id: 'app_store_id',
    },
    android: {
      package: 'com.example.android/package',
      app_name: 'app_name_android',
    },
    web: {
      url: 'https://nextjs.org/web',
      should_fallback: true,
    },
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta property="al:ios:url" content="https://nextjs.org/ios" />
<meta property="al:ios:app_store_id" content="app_store_id" />
<meta property="al:android:package" content="com.example.android/package" />
<meta property="al:android:app_name" content="app_name_android" />
<meta property="al:web:url" content="https://nextjs.org/web" />
<meta property="al:web:should_fallback" content="true" />
```

### `archives`

Describes a collection of records, documents, or other materials of historical interest ([source](https://www.w3.org/TR/2011/WD-html5-20110113/links.html#rel-archives)).

```jsx filename="layout.js | page.js"
export const metadata = {
  archives: ['https://nextjs.org/13'],
}
```

```html filename="<head> output" hideLineNumbers
<link rel="archives" href="https://nextjs.org/13" />
```

### `assets`

```jsx filename="layout.js | page.js"
export const metadata = {
  assets: ['https://nextjs.org/assets'],
}
```

```html filename="<head> output" hideLineNumbers
<link rel="assets" href="https://nextjs.org/assets" />
```

### `bookmarks`

```jsx filename="layout.js | page.js"
export const metadata = {
  bookmarks: ['https://nextjs.org/13'],
}
```

```html filename="<head> output" hideLineNumbers
<link rel="bookmarks" href="https://nextjs.org/13" />
```

### `category`

```jsx filename="layout.js | page.js"
export const metadata = {
  category: 'technology',
}
```

```html filename="<head> output" hideLineNumbers
<meta name="category" content="technology" />
```

### `facebook`

You can connect a Facebook app or Facebook account to your webpage for certain Facebook Social Plugins [Facebook Documentation](https://developers.facebook.com/docs/plugins/comments/#moderation-setup-instructions)

> **Good to know**: You can specify either appId or admins, but not both.

```jsx filename="layout.js | page.js"
export const metadata = {
  facebook: {
    appId: '12345678',
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta property="fb:app_id" content="12345678" />
```

```jsx filename="layout.js | page.js"
export const metadata = {
  facebook: {
    admins: '12345678',
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta property="fb:admins" content="12345678" />
```

If you want to generate multiple fb:admins meta tags you can use array value.

```jsx filename="layout.js | page.js"
export const metadata = {
  facebook: {
    admins: ['12345678', '87654321'],
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta property="fb:admins" content="12345678" />
<meta property="fb:admins" content="87654321" />
```

### `pinterest`

You can enable or disable [Pinterest Rich Pins](https://developers.pinterest.com/docs/web-features/rich-pins-overview/) on your webpage.

```jsx filename="layout.js | page.js"
export const metadata = {
  pinterest: {
    richPin: true,
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta name="pinterest-rich-pin" content="true" />
```

### `other`

All metadata options should be covered using the built-in support. However, there may be custom metadata tags specific to your site, or brand new metadata tags just released. You can use the `other` option to render any custom metadata tag.

```jsx filename="layout.js | page.js"
export const metadata = {
  other: {
    custom: 'meta',
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta name="custom" content="meta" />
```

If you want to generate multiple same key meta tags you can use array value.

```jsx filename="layout.js | page.js"
export const metadata = {
  other: {
    custom: ['meta1', 'meta2'],
  },
}
```

```html filename="<head> output" hideLineNumbers
<meta name="custom" content="meta1" /> <meta name="custom" content="meta2" />
```

### Types

You can add type safety to your metadata by using the `Metadata` type. If you are using the [built-in TypeScript plugin](/docs/app/api-reference/config/typescript) in your IDE, you do not need to manually add the type, but you can still explicitly add it if you want.

#### `metadata` object

```tsx filename="layout.tsx | page.tsx"
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Next.js',
}
```

#### `generateMetadata` function

##### Regular function

```tsx filename="layout.tsx | page.tsx"
import type { Metadata } from 'next'

export function generateMetadata(): Metadata {
  return {
    title: 'Next.js',
  }
}
```

##### Async function

```tsx filename="layout.tsx | page.tsx"
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Next.js',
  }
}
```

##### With segment props

```tsx filename="layout.tsx | page.tsx"
import type { Metadata } from 'next'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export function generateMetadata({ params, searchParams }: Props): Metadata {
  return {
    title: 'Next.js',
  }
}

export default function Page({ params, searchParams }: Props) {}
```

##### With parent metadata

```tsx filename="layout.tsx | page.tsx"
import type { Metadata, ResolvingMetadata } from 'next'

export async function generateMetadata(
  { params, searchParams }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return {
    title: 'Next.js',
  }
}
```

##### JavaScript Projects

For JavaScript projects, you can use JSDoc to add type safety.

```js filename="layout.js | page.js"
/** @type {import("next").Metadata} */
export const metadata = {
  title: 'Next.js',
}
```

### Unsupported Metadata

The following metadata types do not currently have built-in support. However, they can still be rendered in the layout or page itself.

| Metadata                      | Recommendation                                                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<meta http-equiv="...">`     | Use appropriate HTTP Headers via [`redirect()`](/docs/app/api-reference/functions/redirect), [Proxy](/docs/app/api-reference/file-conventions/proxy#nextresponse), [Security Headers](/docs/app/api-reference/config/next-config-js/headers) |
| `<base>`                      | Render the tag in the layout or page itself.                                                                                                                                                                                                 |
| `<noscript>`                  | Render the tag in the layout or page itself.                                                                                                                                                                                                 |
| `<style>`                     | Learn more about [styling in Next.js](/docs/app/getting-started/css).                                                                                                                                                                        |
| `<script>`                    | Learn more about [using scripts](/docs/app/guides/scripts).                                                                                                                                                                                  |
| `<link rel="stylesheet" />`   | `import` stylesheets directly in the layout or page itself.                                                                                                                                                                                  |
| `<link rel="preload />`       | Use [ReactDOM preload method](#link-relpreload)                                                                                                                                                                                              |
| `<link rel="preconnect" />`   | Use [ReactDOM preconnect method](#link-relpreconnect)                                                                                                                                                                                        |
| `<link rel="dns-prefetch" />` | Use [ReactDOM prefetchDNS method](#link-reldns-prefetch)                                                                                                                                                                                     |

### Resource hints

The `<link>` element has a number of `rel` keywords that can be used to hint to the browser that an external resource is likely to be needed. The browser uses this information to apply preloading optimizations depending on the keyword.

While the Metadata API doesn't directly support these hints, you can use new [`ReactDOM` methods](https://github.com/facebook/react/pull/26237) to safely insert them into the `<head>` of the document.

```tsx filename="app/preload-resources.tsx" switcher
'use client'

import ReactDOM from 'react-dom'

export function PreloadResources() {
  ReactDOM.preload('...', { as: '...' })
  ReactDOM.preconnect('...', { crossOrigin: '...' })
  ReactDOM.prefetchDNS('...')

  return '...'
}
```

```jsx filename="app/preload-resources.js" switcher
'use client'

import ReactDOM from 'react-dom'

export function PreloadResources() {
  ReactDOM.preload('...', { as: '...' })
  ReactDOM.preconnect('...', { crossOrigin: '...' })
  ReactDOM.prefetchDNS('...')

  return '...'
}
```

#### `<link rel="preload">`

Start loading a resource early in the page rendering (browser) lifecycle. [MDN Docs](https://developer.mozilla.org/docs/Web/HTML/Attributes/rel/preload).

```tsx
ReactDOM.preload(href: string, options: { as: string })
```

```html filename="<head> output" hideLineNumbers
<link rel="preload" href="..." as="..." />
```

##### `<link rel="preconnect">`

Preemptively initiate a connection to an origin. [MDN Docs](https://developer.mozilla.org/docs/Web/HTML/Attributes/rel/preconnect).

```tsx
ReactDOM.preconnect(href: string, options?: { crossOrigin?: string })
```

```html filename="<head> output" hideLineNumbers
<link rel="preconnect" href="..." crossorigin />
```

#### `<link rel="dns-prefetch">`

Attempt to resolve a domain name before resources get requested. [MDN Docs](https://developer.mozilla.org/docs/Web/HTML/Attributes/rel/dns-prefetch).

```tsx
ReactDOM.prefetchDNS(href: string)
```

```html filename="<head> output" hideLineNumbers
<link rel="dns-prefetch" href="..." />
```

> **Good to know**:
>
> - These methods are currently only supported in Client Components, which are still Server Side Rendered on initial page load.
> - Next.js in-built features such as `next/font`, `next/image` and `next/script` automatically handle relevant resource hints.

## Behavior

### Default Fields

There are two default `meta` tags that are always added even if a route doesn't define metadata:

- The [meta charset tag](https://developer.mozilla.org/docs/Web/HTML/Element/meta#attr-charset) sets the character encoding for the website.
- The [meta viewport tag](https://developer.mozilla.org/docs/Web/HTML/Viewport_meta_tag) sets the viewport width and scale for the website to adjust for different devices.

```html
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

> **Good to know**: You can overwrite the default [`viewport`](/docs/app/api-reference/functions/generate-metadata#viewport) meta tag.

### Streaming metadata

Streaming metadata allows Next.js to render and send the initial UI to the browser, without waiting for `generateMetadata` to complete.

When `generateMetadata` resolves, the resulting metadata tags are appended to the `<body>` tag. We have verified that metadata is interpreted correctly by bots that execute JavaScript and inspect the full DOM (e.g. `Googlebot`).

For **HTML-limited bots** that can’t execute JavaScript (e.g. `facebookexternalhit`), metadata continues to block page rendering. The resulting metadata will be available in the `<head>` tag.

Next.js automatically detects **HTML-limited bots** by looking at the User Agent header. You can use the [`htmlLimitedBots`](/docs/app/api-reference/config/next-config-js/htmlLimitedBots) option in your Next.js config file to override the default [User Agent list](https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/router/utils/html-bots.ts).

To fully disable streaming metadata:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const config: NextConfig = {
  htmlLimitedBots: /.*/,
}

export default config
```

```js filename="next.config.js" switcher
module.exports = {
  htmlLimitedBots: /.*/,
}
```

Streaming metadata improves perceived performance by reducing [TTFB](https://developer.mozilla.org/docs/Glossary/Time_to_first_byte) and can help lowering [LCP](https://developer.mozilla.org/docs/Glossary/Largest_contentful_paint) time.

Overriding `htmlLimitedBots` could lead to longer response times. Streaming metadata is an advanced feature, and the default should be sufficient for most cases.

### Ordering

Metadata is evaluated in order, starting from the root segment down to the segment closest to the final `page.js` segment. For example:

1. `app/layout.tsx` (Root Layout)
2. `app/blog/layout.tsx` (Nested Blog Layout)
3. `app/blog/[slug]/page.tsx` (Blog Page)

### Merging

Following the [evaluation order](#ordering), Metadata objects exported from multiple segments in the same route are **shallowly** merged together to form the final metadata output of a route. Duplicate keys are **replaced** based on their ordering.

This means metadata with nested fields such as [`openGraph`](/docs/app/api-reference/functions/generate-metadata#opengraph) and [`robots`](/docs/app/api-reference/functions/generate-metadata#robots) that are defined in an earlier segment are **overwritten** by the last segment to define them.

#### Overwriting fields

```jsx filename="app/layout.js"
export const metadata = {
  title: 'Acme',
  openGraph: {
    title: 'Acme',
    description: 'Acme is a...',
  },
}
```

```jsx filename="app/blog/page.js"
export const metadata = {
  title: 'Blog',
  openGraph: {
    title: 'Blog',
  },
}

// Output:
// <title>Blog</title>
// <meta property="og:title" content="Blog" />
```

In the example above:

- `title` from `app/layout.js` is **replaced** by `title` in `app/blog/page.js`.
- All `openGraph` fields from `app/layout.js` are **replaced** in `app/blog/page.js` because `app/blog/page.js` sets `openGraph` metadata. Note the absence of `openGraph.description`.

If you'd like to share some nested fields between segments while overwriting others, you can pull them out into a separate variable:

```jsx filename="app/shared-metadata.js"
export const openGraphImage = { images: ['http://...'] }
```

```jsx filename="app/page.js"
import { openGraphImage } from './shared-metadata'

export const metadata = {
  openGraph: {
    ...openGraphImage,
    title: 'Home',
  },
}
```

```jsx filename="app/about/page.js"
import { openGraphImage } from '../shared-metadata'

export const metadata = {
  openGraph: {
    ...openGraphImage,
    title: 'About',
  },
}
```

In the example above, the OG image is shared between `app/layout.js` and `app/about/page.js` while the titles are different.

#### Inheriting fields

```jsx filename="app/layout.js"
export const metadata = {
  title: 'Acme',
  openGraph: {
    title: 'Acme',
    description: 'Acme is a...',
  },
}
```

```jsx filename="app/about/page.js"
export const metadata = {
  title: 'About',
}

// Output:
// <title>About</title>
// <meta property="og:title" content="Acme" />
// <meta property="og:description" content="Acme is a..." />
```

**Notes**

- `title` from `app/layout.js` is **replaced** by `title` in `app/about/page.js`.
- All `openGraph` fields from `app/layout.js` are **inherited** in `app/about/page.js` because `app/about/page.js` doesn't set `openGraph` metadata.

## Version History

| Version   | Changes                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v15.2.0` | Introduced streaming support to `generateMetadata`.                                                                                                     |
| `v13.2.0` | `viewport`, `themeColor`, and `colorScheme` deprecated in favor of the [`viewport` configuration](/docs/app/api-reference/functions/generate-viewport). |
| `v13.2.0` | `metadata` and `generateMetadata` introduced.                                                                                                           |
