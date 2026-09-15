---
title: The Server and Client Boundary
nav_title: Server and Client Boundary
description: Learn where Server and Client Components run in the App Router and how the boundary between them works.
related:
  title: Next Steps
  description: Learn how to apply this model and where the boundary is defined.
  links:
    - app/getting-started/server-and-client-components
    - app/api-reference/directives/use-client
    - app/getting-started/fetching-data
    - app/guides/rendering-philosophy
---

React Server Components (RSC) split a component tree between server and client module graphs. This boundary determines where component code runs and whether that code ships to the browser. RSC keeps Server Components exclusively on the server and retains Client Components for interactive UI. Both compose in a single tree, which the server renders into the [RSC Payload](/docs/app/glossary#rsc-payload), a serialized description of the UI that carries references to the Client Components inside it.

Before RSC, React components followed what RSC now calls the Client Component model. React could render these components to HTML on the server, but the same code also shipped to the browser to [hydrate](https://react.dev/reference/react-dom/client/hydrateRoot#hydrating-server-rendered-html) that HTML. Hydration made the initial HTML interactive and required the component to produce matching output on the server and in the browser. Apps rendered entirely on the client could instead begin with an empty shell and mount the component tree in the browser.

```txt
Server Component
├─ Server Component
└─ Client Component
   └─ Client Component
```

Each component's module belongs to the server [module graph](/docs/app/glossary#module-graph), the client module graph, or both. Next.js compiles a module used by both graphs separately for each environment.

During rendering, the server graph produces references to Client Components and serializes the props passed to them. The client graph does not import the server graph. The client graph receives the references and serialized props through the RSC Payload.

## Rendering environments

The component names suggest a clean split between server and browser, but rendering happens in both places. On the server, the Server Component tree produces the RSC Payload. Next.js uses the payload and Client Components to render HTML at build time or while handling a request.

When deciding where a component runs, consider both its server render and whether its code runs in the browser:

|                      | On the server | In the browser |
| -------------------- | ------------- | -------------- |
| **Server Component** | Yes           | No             |
| **Client Component** | Yes           | Yes            |

The word "Client" indicates that a Client Component also runs in the browser, alongside its server render.

On a direct visit, the following Client Component renders on the server and again in the browser during hydration. Its log appears in the terminal and the browser console. On a client-side navigation, the server sends the RSC Payload, and the component renders in the browser without server-rendered HTML.

```tsx filename="app/hello.tsx" switcher
'use client'

export default function Hello() {
  console.log('Hello rendered') // on a direct visit: server, then browser
  return <p>Hello</p>
}
```

```jsx filename="app/hello.js" switcher
'use client'

export default function Hello() {
  console.log('Hello rendered') // on a direct visit: server, then browser
  return <p>Hello</p>
}
```

Rendering a Client Component on the server produces HTML, but the component remains a Client Component.

Rendering Client Components to HTML predates RSC. Depending on the route, Next.js can generate or regenerate HTML:

- At build time with [Static Site Generation (SSG)](/docs/app/glossary#prerendering).
- After the build with [Incremental Static Regeneration (ISR)](/docs/app/glossary#incremental-static-regeneration-isr).
- For each request with server-side rendering (SSR).

RSC is a separate process that keeps Server Component code on the server and emits the RSC Payload instead of shipping that code. "Server-rendered" describes how Next.js produced the HTML. "Server Component" describes where the component code runs and whether that code ships to the browser.

> **Server Components and SEO**
>
> A crawler that reads only HTML sees the first response and runs none of your JavaScript. Both Server and Client Components contribute HTML to that response.
>
> SEO depends on whether the server render reaches the content. Content gated behind user interaction or an event does not appear in the HTML available to a crawler that does not run JavaScript.

See [Rendering Philosophy](/docs/app/guides/rendering-philosophy) for details about when a component renders, whether at build time or per request, statically or dynamically.

## How data enters the tree

Before RSC, Next.js applications typically gathered server data with functions such as `getStaticProps` or `getServerSideProps`, then passed it to the component tree as props. Data fetching happened before the tree rendered. The tree received data instead of fetching it during render.

```txt
Data
  ↓
Loader or API
  ↓
Props
  ↓
Component tree
```

Because a Server Component runs only on the server, it can access resources such as a database, the filesystem, an internal service, or a secret. The component reads these resources during its own render, without an API route that exposes the data to the client first.

```tsx filename="app/page.tsx" switcher
import { PostList } from '@/app/ui/post-list'
import { getPosts } from '@/lib/data'

export default async function Page() {
  const posts = await getPosts() // runs on the server, during render
  return <PostList posts={posts} />
}
```

```jsx filename="app/page.js" switcher
import { PostList } from '@/app/ui/post-list'
import { getPosts } from '@/lib/data'

export default async function Page() {
  const posts = await getPosts() // runs on the server, during render
  return <PostList posts={posts} />
}
```

With RSC, a Server Component can fetch data while rendering. A separate data-loading step does not need to pass initial props to the component tree.

> **Good to know:** Because a Server Component can read secrets and server-only data directly, be deliberate about what you pass to Client Components.
>
> Props are serialized and sent to the browser. See [Data Security](/docs/app/guides/data-security#passing-data-from-server-to-client).

Server Components do not have to await all data before returning UI. To stream server-fetched data into a Client Component, start the request in a Server Component and pass the pending promise as a prop.

The Client Component reads the promise as a resource with [`use`](https://react.dev/reference/react/use#streaming-data-from-server-to-client). While the promise is pending, the nearest [Suspense](/docs/app/glossary#suspense-boundary) boundary shows its fallback. The Client Component renders when the promise resolves.

Because the request starts before the client runs, the Client Component does not need to fetch the same data after mount. You may still need to start a fetch in the browser when the requested data depends on client-only state or user interaction.

Identical `fetch` requests are [memoized during a server render](/docs/app/api-reference/functions/fetch#memoization). With [Cache Components](/docs/app/getting-started/caching), you can cache a data function or component and revalidate that entry independently of the rest of the page. For implementation patterns, see [Fetching Data](/docs/app/getting-started/fetching-data).

## State and interactivity

A Server Component's code never reaches the browser. The component can render again when Next.js renders the route, such as during a navigation, refresh, or after revalidation.

A Client Component's code does reach the browser. React hydrates the component on the initial load, and client-side updates can re-render it in the browser.

> **Good to know:** On the initial load, the RSC Payload ships with the HTML.
>
> Mutating Server Component DOM nodes directly can put the DOM out of sync with React's component tree.
>
> To update Server Component output, render the component again on the server. When the browser receives a new RSC Payload, React reconciles the component tree and updates the DOM. See [Streaming](/docs/app/guides/streaming#the-component-payload).

`useState`, `useEffect`, and event handlers require code that runs in the browser and responds to updates. Server Component code never reaches the browser, so it cannot use these client-side APIs.

Built-in browser and HTML behavior can provide interactivity without a Client Component. For example:

- A `<details>` element opens and closes.
- A `<form>` can submit through a [Server Function](/docs/app/guides/server-actions) passed to its `action` prop.
- A `<video controls>` element plays and pauses.

Use a Client Component when the behavior requires browser state that changes over time, such as a controlled input, live filter, or drag handle. A button or form does not require a Client Component when the browser provides all the required behavior.

For the practical list of what belongs in each environment, see [When to use Server and Client Components](/docs/app/getting-started/server-and-client-components#when-to-use-server-and-client-components).

## Crossing the boundary

You mark a Client Component with the [`'use client'`](/docs/app/api-reference/directives/use-client) directive. The directive draws a boundary in the module graph, and two rules determine what crosses it:

- **Code** crosses through imports. Whatever a Client Component imports is pulled into the [client bundle](/docs/app/glossary#client-bundles).
- **Data** crosses through props, and it must be [serializable](/docs/app/getting-started/server-and-client-components#passing-data-from-server-to-client-components), so functions like event handlers cannot cross.

> **Good to know:**
>
> Passing a function as a prop from a Server Component to a Client Component throws. An event handler like `onClick` cannot cross. A [Server Function](/docs/app/guides/server-actions) marked with `'use server'` crosses as a reference.
>
> A Server Function is not distinguishable from a plain function by its type. The TypeScript plugin allows a Client Component prop typed as a function when its name is `action` or ends in `Action`. The plugin flags other function props.

A rendered React element can cross the boundary because it is serializable data. Passing rendered output as `children` lets a Server Component nest inside a Client Component without importing the Server Component's code into the client graph.

```tsx filename="app/page.tsx" switcher
import { Cart } from '@/app/ui/cart'
import { Modal } from '@/app/ui/modal'

// Page and Cart are Server Components. Modal is a Client Component
export default function Page() {
  return (
    <Modal title={<div>Your cart</div>}>
      <Cart />
    </Modal>
  )
}
```

```jsx filename="app/page.js" switcher
import { Cart } from '@/app/ui/cart'
import { Modal } from '@/app/ui/modal'

// Page and Cart are Server Components. Modal is a Client Component
export default function Page() {
  return (
    <Modal title={<div>Your cart</div>}>
      <Cart />
    </Modal>
  )
}
```

The `children` prop behaves like any other prop. `Modal` receives `title` and `children` as serialized React elements, then renders them in the positions defined by its implementation.

```tsx filename="app/ui/modal.tsx" switcher
'use client'

import { useState, type ReactNode } from 'react'

export function Modal({
  title,
  children,
}: {
  title: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  if (!open) return null

  return (
    <div role="dialog">
      <header>
        {title}
        <button onClick={() => setOpen(false)}>Close</button>
      </header>
      {children}
    </div>
  )
}
```

```jsx filename="app/ui/modal.js" switcher
'use client'

import { useState } from 'react'

export function Modal({ title, children }) {
  const [open, setOpen] = useState(true)
  if (!open) return null

  return (
    <div role="dialog">
      <header>
        {title}
        <button onClick={() => setOpen(false)}>Close</button>
      </header>
      {children}
    </div>
  )
}
```

Here, `Cart` runs on the server, and `Modal` only ever sees its output, never its code.

<details>
  <summary>Owner and parent</summary>

In this example, `Page` shows two roles React keeps separate:

- The **owner** is the component whose source contains the JSX for a child. `Page` owns both `Modal` and `Cart`.
- The **parent** directly contains the child in the rendered tree. `Modal` is the parent of `Cart`.

Because `Cart`'s owner is a Server Component, `Cart` renders on the server. `Modal` is only the parent, so `Modal` receives `Cart`'s output to place but not its code to run. This separation lets a Client Component display a Server Component it never imported.

</details>

<details>
  <summary>Compound components across the boundary</summary>

Compound components can expose subcomponents as static properties, such as `Menu.Item` or `Tabs.Panel`. This pattern works within one graph when all pieces are Server Components or all pieces are Client Components.

The pattern breaks when a static member crosses the boundary. A Server Component that imports a Client Component receives a client reference instead of the function. As a result, `Menu.Item` is `undefined`, and React throws "Element type is invalid."

Use a compound Client Component from another Client Component. To use its pieces from a Server Component, expose them as named exports instead of static properties.

</details>

You only need `'use client'` at the entry to a client subtree, not on every file inside it. Every module imported from that entry becomes part of the client module graph.

To leave a shared component unchanged, create a Client Component wrapper that imports it and place the directive on the wrapper. The wrapper keeps the shared module unchanged and puts the boundary closer to your application code. It also avoids adding the directive to every shared component that calls `useState` or `useEffect`.

If client code enters the server graph without a boundary, the compiler points to where you need the directive.

For more patterns, see [Interleaving Server and Client Components](/docs/app/getting-started/server-and-client-components#interleaving-server-and-client-components).

For the other directives used in Next.js, see the [directives](/docs/app/api-reference/directives) documentation.
