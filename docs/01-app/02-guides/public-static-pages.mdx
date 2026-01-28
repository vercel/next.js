---
title: Building public pages
description: Learn how to build public, "static" pages that share data across users, such as landing pages, list pages (products, blogs, etc.), marketing and news sites.
nav_title: Public pages
---

Public pages show the same content to every user. Common examples include landing pages, marketing pages, and product pages.

Since data is shared, these kind of pages can be [prerendered](/docs/app/glossary#prerendering) ahead of time and reused. This leads to faster page loads and lower server costs.

This guide will show you how to build public pages that share data across users.

## Example

As an example, we'll build a product list page.

We'll start with a static header, add a product list with async external data, and learn how to render it without blocking the response. Finally, we'll add a user-specific promotion banner without switching the entire page to [request-time rendering](/docs/app/glossary#request-time-rendering).

You can find the resources used in this example here:

- [Video](https://youtu.be/F6romq71KtI)
- [Demo](https://cache-components-public-pages.labs.vercel.dev/)
- [Code](https://github.com/vercel-labs/cache-components-public-pages)

### Step 1: Add a simple header

Let's start with a simple header.

```tsx filename="app/products/page.tsx"
// Static component
function Header() {
  return <h1>Shop</h1>
}

export default async function Page() {
  return (
    <>
      <Header />
    </>
  )
}
```

#### Static components

The `<Header />` component doesn't depend on any inputs that change between requests, such as: external data, request headers, route params, the current time, or random values.

Since its output never changes and can be determined ahead of time, this kind of component is called a **static** component. With no reason to wait for a request, Next.js can safely **prerender** the page at [build time](/docs/app/glossary#build-time).

We can confirm this by running [`next build`](/docs/app/api-reference/cli/next#next-build-options).

```bash filename="Terminal"
Route (app)      Revalidate  Expire
┌ ○ /products           15m      1y
└ ○ /_not-found

○  (Static)  prerendered as static content
```

Notice that the product route is marked as static, even though we didn't add any explicit configuration.

### Step 2: Add the product list

Now, let's fetch and render our product list.

```tsx filename="app/products/page.tsx"
import db from '@/db'
import { List } from '@/app/products/ui'

function Header() {}

// Dynamic component
async function ProductList() {
  const products = await db.product.findMany()
  return <List items={products} />
}

export default async function Page() {
  return (
    <>
      <Header />
      <ProductList />
    </>
  )
}
```

Unlike the header, the product list depends on external data.

#### Dynamic components

Since this data **can** change over time, the rendered output is no longer guaranteed to be stable. This makes the product list a **dynamic** component.

Without guidance, the framework assumes you want to fetch **fresh** data on every user request. This design choice reflects standard web behavior where a new server request renders the page.

However, if this component is rendered at request time, fetching its data will delay the **entire** route from responding. If we refresh the page, we can see this happen.

Even though the header is rendered instantly, it can't be sent to the browser until the product list has finished fetching.

To protect us from this performance cliff, Next.js will show us a [warning](/docs/messages/blocking-route) the first time we **await** data: `Blocking data was accessed outside of Suspense`

At this point, we have to decide how to **unblock** the response. Either:

- [**Cache**](/docs/app/glossary#cache-components) the component, so it becomes **stable** and can be prerendered with the rest of the page.
- [**Stream**](/docs/app/glossary#streaming) the component, so it becomes **non-blocking** and the rest of the page doesn't have to wait for it.

In our case, the product catalog is shared across all users, so caching is the right choice.

### Cache components

We can mark a function as cacheable using the [`'use cache'`](/docs/app/api-reference/directives/use-cache) directive.

```tsx filename="app/products/page.tsx"
import db from '@/db'
import { List } from '@/app/products/ui'

function Header() {}

// Cache component
async function ProductList() {
  'use cache'
  const products = await db.product.findMany()
  return <List items={products} />
}

export default async function Page() {
  return (
    <>
      <Header />
      <ProductList />
    </>
  )
}
```

This turns it into a [cache component](/docs/app/glossary#cache-components). The first time it runs, whatever we return will be cached and reused.

If a cache component's inputs are available **before** the request arrives, it can be prerendered just like a static component.

If we refresh again, we can see the page loads instantly because the cache component doesn't block the response. And, if we run `next build` again, we can confirm the page is still static:

```bash filename="Terminal"
Route (app)      Revalidate  Expire
┌ ○ /products           15m      1y
└ ○ /_not-found

○  (Static)  prerendered as static content
```

But, pages rarely stay static forever.

### Step 3: Add a dynamic promotion banner

Sooner or later, even simple pages need some dynamic content. To demonstrate this, let's add a promotional banner:

```tsx filename="app/products/page.tsx"
import db from '@/db'
import { List, Promotion } from '@/app/products/ui'
import { getPromotion } from '@/app/products/data'

function Header() {}

async function ProductList() {}

// Dynamic component
async function PromotionContent() {
  const promotion = await getPromotion()
  return <Promotion data={promotion} />
}

export default async function Page() {
  return (
    <>
      <PromotionContent />
      <Header />
      <ProductList />
    </>
  )
}
```

Once again, this starts off as dynamic. And as before, introducing blocking behavior triggers a Next.js warning.

Last time, the data was shared, so it could be cached. This time, the promotion depends on request specific inputs like the user's location and A/B tests, so we can't cache our way out of the blocking behavior.

### Partial prerendering

Adding dynamic content doesn't mean we have to go back to a fully blocking render. We can unblock the response with streaming.

Next.js supports streaming by default. We can use a [Suspense boundary](/docs/app/glossary#suspense-boundary) to tell the framework where to slice the streamed response into _chunks_, and what fallback UI to show while content loads.

```tsx filename="app/products/page.tsx"
import { Suspense } from 'react'
import db from '@/db'
import { List, Promotion, PromotionSkeleton } from '@/app/products/ui'
import { getPromotion } from '@/app/products/data'

function Header() {}

async function ProductList() {}

// Dynamic component (streamed)
async function PromotionContent() {
  const promotion = await getPromotion()
  return <Promotion data={promotion} />
}

export default async function Page() {
  return (
    <>
      <Suspense fallback={<PromotionSkeleton />}>
        <PromotionContent />
      </Suspense>
      <Header />
      <ProductList />
    </>
  )
}
```

The fallback is prerendered alongside the rest of our static and cached content. The inner component streams in later, once its async work completes.

With this change, Next.js can separate prerenderable work from request-time work and the route becomes [partially prerendered](/docs/app/glossary#partial-prerendering-ppr).

Again, we can confirm this by running `next build`:

```bash filename="Terminal"
Route (app)      Revalidate  Expire
┌ ◐ /products    15m      1y
└ ◐ /_not-found

◐  (Partial Prerender)  Prerendered as static HTML with dynamic server-streamed content
```

At [**build time**](/docs/app/glossary#build-time), most of the page, including the header, product list and promotion fallback, is rendered, cached and pushed to a content delivery network.

At [**request time**](/docs/app/glossary#request-time), the prerendered part is served instantly from a CDN node close to the user.

In parallel, the user specific promotion is rendered on the server, streamed to the client, and swapped into the fallback slot.

If we refresh the page one last time, we can see most of the page loads instantly, while the dynamic parts stream in as they become available.

### Next steps

We've learned how to build mostly static pages that include pockets of dynamic content.

We started with a static page, added async work, and resolved the blocking behavior by caching what could be prerendered, and streaming what couldn't.

In future guides, we'll learn how to:

- Revalidate prerendered pages or cached data.
- Create variants of the same page with route params.
- Create private pages with personalized user data.
