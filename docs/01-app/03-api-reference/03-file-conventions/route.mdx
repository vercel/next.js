---
title: route.js
description: API reference for the route.js special file.
---

Route Handlers allow you to create custom request handlers for a given route using the Web [Request](https://developer.mozilla.org/docs/Web/API/Request) and [Response](https://developer.mozilla.org/docs/Web/API/Response) APIs.

```ts filename="route.ts" switcher
export async function GET() {
  return Response.json({ message: 'Hello World' })
}
```

```js filename="route.js" switcher
export async function GET() {
  return Response.json({ message: 'Hello World' })
}
```

## Reference

### HTTP Methods

A **route** file allows you to create custom request handlers for a given route. The following [HTTP methods](https://developer.mozilla.org/docs/Web/HTTP/Methods) are supported: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.

```ts filename="route.ts" switcher
export async function GET(request: Request) {}

export async function HEAD(request: Request) {}

export async function POST(request: Request) {}

export async function PUT(request: Request) {}

export async function DELETE(request: Request) {}

export async function PATCH(request: Request) {}

// If `OPTIONS` is not defined, Next.js will automatically implement `OPTIONS` and set the appropriate Response `Allow` header depending on the other methods defined in the Route Handler.
export async function OPTIONS(request: Request) {}
```

```js filename="route.js" switcher
export async function GET(request) {}

export async function HEAD(request) {}

export async function POST(request) {}

export async function PUT(request) {}

export async function DELETE(request) {}

export async function PATCH(request) {}

// If `OPTIONS` is not defined, Next.js will automatically implement `OPTIONS` and set the appropriate Response `Allow` header depending on the other methods defined in the Route Handler.
export async function OPTIONS(request) {}
```

### Parameters

#### `request` (optional)

The `request` object is a [NextRequest](/docs/app/api-reference/functions/next-request) object, which is an extension of the Web [Request](https://developer.mozilla.org/docs/Web/API/Request) API. `NextRequest` gives you further control over the incoming request, including easily accessing `cookies` and an extended, parsed, URL object `nextUrl`.

```ts filename="route.ts" switcher
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl
}
```

```js filename="route.js" switcher
export async function GET(request) {
  const url = request.nextUrl
}
```

#### `context` (optional)

- **`params`**: a promise that resolves to an object containing the [dynamic route parameters](/docs/app/api-reference/file-conventions/dynamic-routes) for the current route.

```ts filename="app/dashboard/[team]/route.ts" switcher
export async function GET(
  request: Request,
  { params }: { params: Promise<{ team: string }> }
) {
  const { team } = await params
}
```

```js filename="app/dashboard/[team]/route.js" switcher
export async function GET(request, { params }) {
  const { team } = await params
}
```

| Example                          | URL            | `params`                           |
| -------------------------------- | -------------- | ---------------------------------- |
| `app/dashboard/[team]/route.js`  | `/dashboard/1` | `Promise<{ team: '1' }>`           |
| `app/shop/[tag]/[item]/route.js` | `/shop/1/2`    | `Promise<{ tag: '1', item: '2' }>` |
| `app/blog/[...slug]/route.js`    | `/blog/1/2`    | `Promise<{ slug: ['1', '2'] }>`    |

### Route Context Helper

You can type the Route Handler context using `RouteContext` to get strongly typed `params` from a route literal. `RouteContext` is a globally available helper.

```ts filename="app/users/[id]/route.ts"
import type { NextRequest } from 'next/server'

export async function GET(_req: NextRequest, ctx: RouteContext<'/users/[id]'>) {
  const { id } = await ctx.params
  return Response.json({ id })
}
```

> **Good to know**
>
> - Types are generated during `next dev`, `next build` or `next typegen`.
> - After type generation, the `RouteContext` helper is globally available. It doesn't need to be imported.

## Examples

### Cookies

You can read or set cookies with [`cookies`](/docs/app/api-reference/functions/cookies) from `next/headers`.

```ts filename="route.ts" switcher
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()

  const a = cookieStore.get('a')
  const b = cookieStore.set('b', '1')
  const c = cookieStore.delete('c')
}
```

```js filename="route.js" switcher
import { cookies } from 'next/headers'

export async function GET(request) {
  const cookieStore = await cookies()

  const a = cookieStore.get('a')
  const b = cookieStore.set('b', '1')
  const c = cookieStore.delete('c')
}
```

Alternatively, you can return a new `Response` using the [`Set-Cookie`](https://developer.mozilla.org/docs/Web/HTTP/Headers/Set-Cookie) header.

```ts filename="app/api/route.ts" switcher
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')

  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { 'Set-Cookie': `token=${token.value}` },
  })
}
```

```js filename="app/api/route.js" switcher
import { cookies } from 'next/headers'

export async function GET(request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')

  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { 'Set-Cookie': `token=${token.value}` },
  })
}
```

You can also use the underlying Web APIs to read cookies from the request ([`NextRequest`](/docs/app/api-reference/functions/next-request)):

```ts filename="app/api/route.ts" switcher
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')
}
```

```js filename="app/api/route.js" switcher
export async function GET(request) {
  const token = request.cookies.get('token')
}
```

### Headers

You can read headers with [`headers`](/docs/app/api-reference/functions/headers) from `next/headers`.

```ts filename="route.ts" switcher
import { headers } from 'next/headers'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const headersList = await headers()
  const referer = headersList.get('referer')
}
```

```js filename="route.js" switcher
import { headers } from 'next/headers'

export async function GET(request) {
  const headersList = await headers()
  const referer = headersList.get('referer')
}
```

This `headers` instance is read-only. To set headers, you need to return a new `Response` with new `headers`.

```ts filename="app/api/route.ts" switcher
import { headers } from 'next/headers'

export async function GET(request: Request) {
  const headersList = await headers()
  const referer = headersList.get('referer')

  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { referer: referer },
  })
}
```

```js filename="app/api/route.js" switcher
import { headers } from 'next/headers'

export async function GET(request) {
  const headersList = await headers()
  const referer = headersList.get('referer')

  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { referer: referer },
  })
}
```

You can also use the underlying Web APIs to read headers from the request ([`NextRequest`](/docs/app/api-reference/functions/next-request)):

```ts filename="app/api/route.ts" switcher
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
}
```

```js filename="app/api/route.js" switcher
export async function GET(request) {
  const requestHeaders = new Headers(request.headers)
}
```

### Revalidating Cached Data

You can [revalidate cached data](/docs/app/guides/incremental-static-regeneration) using the `revalidate` route segment config option.

```ts filename="app/posts/route.ts" switcher
export const revalidate = 60

export async function GET() {
  const data = await fetch('https://api.vercel.app/blog')
  const posts = await data.json()

  return Response.json(posts)
}
```

```js filename="app/posts/route.js" switcher
export const revalidate = 60

export async function GET() {
  const data = await fetch('https://api.vercel.app/blog')
  const posts = await data.json()

  return Response.json(posts)
}
```

### Redirects

```ts filename="app/api/route.ts" switcher
import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  redirect('https://nextjs.org/')
}
```

```js filename="app/api/route.js" switcher
import { redirect } from 'next/navigation'

export async function GET(request) {
  redirect('https://nextjs.org/')
}
```

### Dynamic Route Segments

Route Handlers can use [Dynamic Segments](/docs/app/api-reference/file-conventions/dynamic-routes) to create request handlers from dynamic data.

```ts filename="app/items/[slug]/route.ts" switcher
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params // 'a', 'b', or 'c'
}
```

```js filename="app/items/[slug]/route.js" switcher
export async function GET(request, { params }) {
  const { slug } = await params // 'a', 'b', or 'c'
}
```

| Route                       | Example URL | `params`                 |
| --------------------------- | ----------- | ------------------------ |
| `app/items/[slug]/route.js` | `/items/a`  | `Promise<{ slug: 'a' }>` |
| `app/items/[slug]/route.js` | `/items/b`  | `Promise<{ slug: 'b' }>` |
| `app/items/[slug]/route.js` | `/items/c`  | `Promise<{ slug: 'c' }>` |

### URL Query Parameters

The request object passed to the Route Handler is a `NextRequest` instance, which includes [some additional convenience methods](/docs/app/api-reference/functions/next-request#nexturl), such as those for more easily handling query parameters.

```ts filename="app/api/search/route.ts" switcher
import { type NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('query')
  // query is "hello" for /api/search?query=hello
}
```

```js filename="app/api/search/route.js" switcher
export function GET(request) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('query')
  // query is "hello" for /api/search?query=hello
}
```

### Streaming

Streaming is commonly used in combination with Large Language Models (LLMs), such as OpenAI, for AI-generated content. Learn more about the [AI SDK](https://sdk.vercel.ai/docs/introduction).

```ts filename="app/api/chat/route.ts" switcher
import { openai } from '@ai-sdk/openai'
import { StreamingTextResponse, streamText } from 'ai'

export async function POST(req: Request) {
  const { messages } = await req.json()
  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
  })

  return new StreamingTextResponse(result.toAIStream())
}
```

```js filename="app/api/chat/route.js" switcher
import { openai } from '@ai-sdk/openai'
import { StreamingTextResponse, streamText } from 'ai'

export async function POST(req) {
  const { messages } = await req.json()
  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
  })

  return new StreamingTextResponse(result.toAIStream())
}
```

These abstractions use the Web APIs to create a stream. You can also use the underlying Web APIs directly.

```ts filename="app/api/route.ts" switcher
// https://developer.mozilla.org/docs/Web/API/ReadableStream#convert_async_iterator_to_stream
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()

      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
  })
}

function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}

const encoder = new TextEncoder()

async function* makeIterator() {
  yield encoder.encode('<p>One</p>')
  await sleep(200)
  yield encoder.encode('<p>Two</p>')
  await sleep(200)
  yield encoder.encode('<p>Three</p>')
}

export async function GET() {
  const iterator = makeIterator()
  const stream = iteratorToStream(iterator)

  return new Response(stream)
}
```

```js filename="app/api/route.js" switcher
// https://developer.mozilla.org/docs/Web/API/ReadableStream#convert_async_iterator_to_stream
function iteratorToStream(iterator) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()

      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
  })
}

function sleep(time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}

const encoder = new TextEncoder()

async function* makeIterator() {
  yield encoder.encode('<p>One</p>')
  await sleep(200)
  yield encoder.encode('<p>Two</p>')
  await sleep(200)
  yield encoder.encode('<p>Three</p>')
}

export async function GET() {
  const iterator = makeIterator()
  const stream = iteratorToStream(iterator)

  return new Response(stream)
}
```

### Request Body

You can read the `Request` body using the standard Web API methods:

```ts filename="app/items/route.ts" switcher
export async function POST(request: Request) {
  const res = await request.json()
  return Response.json({ res })
}
```

```js filename="app/items/route.js" switcher
export async function POST(request) {
  const res = await request.json()
  return Response.json({ res })
}
```

### Request Body FormData

You can read the `FormData` using the `request.formData()` function:

```ts filename="app/items/route.ts" switcher
export async function POST(request: Request) {
  const formData = await request.formData()
  const name = formData.get('name')
  const email = formData.get('email')
  return Response.json({ name, email })
}
```

```js filename="app/items/route.js" switcher
export async function POST(request) {
  const formData = await request.formData()
  const name = formData.get('name')
  const email = formData.get('email')
  return Response.json({ name, email })
}
```

Since `formData` data are all strings, you may want to use [`zod-form-data`](https://www.npmjs.com/zod-form-data) to validate the request and retrieve data in the format you prefer (e.g. `number`).

### CORS

You can set CORS headers for a specific Route Handler using the standard Web API methods:

```ts filename="app/api/route.ts" switcher
export async function GET(request: Request) {
  return new Response('Hello, Next.js!', {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
```

```js filename="app/api/route.js" switcher
export async function GET(request) {
  return new Response('Hello, Next.js!', {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
```

> **Good to know**:
>
> - To add CORS headers to multiple Route Handlers, you can use [Proxy](/docs/app/api-reference/file-conventions/proxy#cors) or the [`next.config.js` file](/docs/app/api-reference/config/next-config-js/headers#cors).

### Webhooks

You can use a Route Handler to receive webhooks from third-party services:

```ts filename="app/api/route.ts" switcher
export async function POST(request: Request) {
  try {
    const text = await request.text()
    // Process the webhook payload
  } catch (error) {
    return new Response(`Webhook error: ${error.message}`, {
      status: 400,
    })
  }

  return new Response('Success!', {
    status: 200,
  })
}
```

```js filename="app/api/route.js" switcher
export async function POST(request) {
  try {
    const text = await request.text()
    // Process the webhook payload
  } catch (error) {
    return new Response(`Webhook error: ${error.message}`, {
      status: 400,
    })
  }

  return new Response('Success!', {
    status: 200,
  })
}
```

Notably, unlike API Routes with the Pages Router, you do not need to use `bodyParser` to use any additional configuration.

### Non-UI Responses

You can use Route Handlers to return non-UI content. Note that [`sitemap.xml`](/docs/app/api-reference/file-conventions/metadata/sitemap#generating-a-sitemap-using-code-js-ts), [`robots.txt`](/docs/app/api-reference/file-conventions/metadata/robots#generate-a-robots-file), [`app icons`](/docs/app/api-reference/file-conventions/metadata/app-icons#generate-icons-using-code-js-ts-tsx), and [open graph images](/docs/app/api-reference/file-conventions/metadata/opengraph-image) all have built-in support.

```ts filename="app/rss.xml/route.ts" switcher
export async function GET() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">

<channel>
  <title>Next.js Documentation</title>
  <link>https://nextjs.org/docs</link>
  <description>The React Framework for the Web</description>
</channel>

</rss>`,
    {
      headers: {
        'Content-Type': 'text/xml',
      },
    }
  )
}
```

```js filename="app/rss.xml/route.js" switcher
export async function GET() {
  return new Response(`<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">

<channel>
  <title>Next.js Documentation</title>
  <link>https://nextjs.org/docs</link>
  <description>The React Framework for the Web</description>
</channel>

</rss>`)
}
```

### Segment Config Options

Route Handlers use the same [route segment configuration](/docs/app/api-reference/file-conventions/route-segment-config) as pages and layouts.

```ts filename="app/items/route.ts" switcher
export const dynamic = 'auto'
export const dynamicParams = true
export const revalidate = false
export const fetchCache = 'auto'
export const runtime = 'nodejs'
export const preferredRegion = 'auto'
```

```js filename="app/items/route.js" switcher
export const dynamic = 'auto'
export const dynamicParams = true
export const revalidate = false
export const fetchCache = 'auto'
export const runtime = 'nodejs'
export const preferredRegion = 'auto'
```

See the [API reference](/docs/app/api-reference/file-conventions/route-segment-config) for more details.

## Version History

| Version      | Changes                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `v15.0.0-RC` | `context.params` is now a promise. A [codemod](/docs/app/guides/upgrading/codemods#150) is available |
| `v15.0.0-RC` | The default caching for `GET` handlers was changed from static to dynamic                            |
| `v13.2.0`    | Route Handlers are introduced.                                                                       |
