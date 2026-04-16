---
title: How to prevent flash before hydration
nav_title: Preventing Flash
description: Learn how to correct server-rendered content before the browser paints, avoiding visible flash when the page hydrates.
---

User preferences, browser settings, and client-side storage aren't available during server rendering. The server emits a reasonable default, but any UI that depends on client-only state (locale, timezone, theme, persisted interactions) needs to be updated before the user sees it.

Some common approaches to this problem:

- A Client Component that re-renders with client values causes a hydration error.
- Deferring to `useEffect` avoids the error but introduces a visible flash.
- Rendering only on the server means giving up on client-specific formatting entirely.

Using an **inline script** that runs synchronously as the browser parses the HTML, you can update the DOM **before the first paint**. This guide covers dates, themes, and persisted UI state.

## Example

The companion [demo](https://preventing-flash-before-hydration.labs.vercel.dev/) ([source](https://github.com/vercel-labs/preventing-flash-before-hydration)) is built with `LANG=ja_JP.UTF-8` to simulate a server/client locale mismatch. It lets you compare:

- Inline script date formatting with no flash and no hydration error
- A Client Component that calls `toLocaleDateString()` directly, showing the hydration error
- An accordion that persists its open section to `localStorage` using a lazy `useState` initializer

Use Chrome DevTools [Sensors](https://developer.chrome.com/docs/devtools/sensors) to override your locale (e.g. `ru-RU`) and see how each approach behaves.

## Dates and formatting

A UTC timestamp like `2026-06-15T18:00:00Z` represents a fixed point in time, but how it is formatted for display depends on the user's locale and timezone. `toLocaleDateString()` and `Intl.DateTimeFormat` on the server use the server's settings, which may not match the user's.

### The problem

A natural approach is a Client Component that formats the date:

```tsx filename="app/components/event-date.tsx" switcher
'use client'

export function EventDate({ date }: { date: string }) {
  return <p>{new Date(date).toLocaleDateString()}</p>
}
```

```jsx filename="app/components/event-date.js" switcher
'use client'

export function EventDate({ date }) {
  return <p>{new Date(date).toLocaleDateString()}</p>
}
```

During SSR, `toLocaleDateString()` runs in Node.js and formats using the server's locale (e.g. `6/15/2026`). On hydration, React re-executes the component in the browser and produces the user's locale (e.g. `2026/6/15`). React detects the mismatch, throws a hydration error, and the user sees a flash.

You could work around this with `useEffect` to update the date after hydration, but the user still sees the server-formatted date first. A Server Component avoids the error entirely, but the date is permanently in the server's locale.

> **Good to know:** This issue is easy to miss in local development if your machine's locale matches your browser's. Run your dev server with `TZ` and `LANG` set differently from your browser to catch mismatches early (e.g. `TZ=UTC LANG=ja_JP.UTF-8 next dev`). `TZ=UTC` is a good default since most servers run in UTC.

### Fixing it with an inline script

1. The server renders the date with its locale into a `<p>`.
2. Place a `<script>` (via [`dangerouslySetInnerHTML`](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)) after the element. The browser runs it **synchronously** during HTML parsing, before the first paint.
3. Add [`suppressHydrationWarning`](https://react.dev/reference/react-dom/client/hydrateRoot#suppressing-unavoidable-hydration-mismatch-errors) to the element, since the inline script changes the text before React hydrates. See [Understanding `suppressHydrationWarning`](#understanding-suppresshydrationwarning) below.

```tsx filename="app/events/page.tsx" switcher
import { getEvent } from '@/app/lib/events'

export default async function Page() {
  const event = await getEvent('nextjs-conf')

  return (
    <section>
      <h1>{event.name}</h1>
      <p id="event-date" suppressHydrationWarning>
        {new Date(event.date).toLocaleDateString()}
      </p>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById("event-date").textContent=new Date("${event.date}").toLocaleDateString()`,
        }}
      />
    </section>
  )
}
```

```jsx filename="app/events/page.js" switcher
import { getEvent } from '@/app/lib/events'

export default async function Page() {
  const event = await getEvent('nextjs-conf')

  return (
    <section>
      <h1>{event.name}</h1>
      <p id="event-date" suppressHydrationWarning>
        {new Date(event.date).toLocaleDateString()}
      </p>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById("event-date").textContent=new Date("${event.date}").toLocaleDateString()`,
        }}
      />
    </section>
  )
}
```

This works on full page loads (direct visits, refreshes). For client-side navigations via `<Link>`, see [Extracting a reusable component](#extracting-a-reusable-component).

### Understanding `suppressHydrationWarning`

When React hydrates and finds a text mismatch:

- **Without `suppressHydrationWarning`**: React treats it as a hydration error and recovers by client-rendering from the nearest error or Suspense boundary. This causes a flash, and inline script corrections on **other components within that boundary are lost** because the scripts don't re-execute when React rebuilds the DOM.
- **With `suppressHydrationWarning`**: React keeps whatever is in the DOM and discards the client's output for that element. The DOM wins.

The inline script puts the correct value in the DOM before React hydrates. Even for Server Components, React compares the DOM against the RSC payload during hydration, and the inline script has changed the text. `suppressHydrationWarning` tells React to accept the DOM rather than the payload.

### Extracting a reusable component

Scripts inserted via DOM updates don't execute in the browser. On client-side navigations, React renders the component from the RSC payload and the script won't run. Making the component a Client Component solves this: `toLocaleDateString()` runs directly in the browser on soft navigations, while the inline script handles hard navigations. [`useId`](https://react.dev/reference/react/useId) generates a stable unique ID for each instance.

React also warns in development when rendering produces `<script>` tags. To avoid this, wrap the script in a helper that sets `type="text/javascript"` on the server and `type="text/plain"` on the client. `suppressHydrationWarning` handles the type mismatch.

```tsx filename="app/components/inline-script.tsx" switcher
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

```jsx filename="app/components/inline-script.js" switcher
export function InlineScript({ html }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

```tsx filename="app/components/local-date.tsx" switcher
'use client'

import { useId } from 'react'
import { InlineScript } from './inline-script'

export function LocalDate({
  date,
  options,
}: {
  date: string
  options?: Intl.DateTimeFormatOptions
}) {
  const id = useId()

  return (
    <>
      <time id={id} dateTime={date} suppressHydrationWarning>
        {new Date(date).toLocaleDateString(undefined, options)}
      </time>
      <InlineScript
        html={`{var n=document.getElementById("${id}");if(n)n.textContent=new Date("${date}").toLocaleDateString(undefined,${JSON.stringify(options)})}`}
      />
    </>
  )
}
```

```jsx filename="app/components/local-date.js" switcher
'use client'

import { useId } from 'react'
import { InlineScript } from './inline-script'

export function LocalDate({ date, options }) {
  const id = useId()

  return (
    <>
      <time id={id} dateTime={date} suppressHydrationWarning>
        {new Date(date).toLocaleDateString(undefined, options)}
      </time>
      <InlineScript
        html={`{var n=document.getElementById("${id}");if(n)n.textContent=new Date("${date}").toLocaleDateString(undefined,${JSON.stringify(options)})}`}
      />
    </>
  )
}
```

- **Hard navigation** (initial load, refresh): The script executes during HTML parsing and corrects the date. `suppressHydrationWarning` tells React to accept the DOM.
- **Client-side navigation** (via `<Link>`): `toLocaleDateString()` runs in the browser as part of the Client Component render. The script is `text/plain` and ignored.

```tsx filename="app/events/page.tsx" switcher
import { LocalDate } from '@/app/components/local-date'
import { getEvent } from '@/app/lib/events'

export default async function Page() {
  const event = await getEvent('nextjs-conf')

  return (
    <section>
      <h1>{event.name}</h1>
      <LocalDate
        date={event.date}
        options={{ year: 'numeric', month: 'long', day: 'numeric' }}
      />
    </section>
  )
}
```

```jsx filename="app/events/page.js" switcher
import { LocalDate } from '@/app/components/local-date'
import { getEvent } from '@/app/lib/events'

export default async function Page() {
  const event = await getEvent('nextjs-conf')

  return (
    <section>
      <h1>{event.name}</h1>
      <LocalDate
        date={event.date}
        options={{ year: 'numeric', month: 'long', day: 'numeric' }}
      />
    </section>
  )
}
```

> **Good to know:**
>
> - Use a [`<time>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/time) element with a `dateTime` attribute so search engines and screen readers can parse the ISO string regardless of the displayed text.
> - Inline scripts with `dangerouslySetInnerHTML` are blocked by strict [Content Security Policies](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) that don't allow `'unsafe-inline'`. If your app uses a CSP, you'll need to add a [nonce](/docs/app/guides/content-security-policy).

## Themes

Your page may be server-rendered with a default theme (e.g. light), but the user has a saved preference in `localStorage`. The same inline script technique works: read the value and set a `data-theme` attribute on `<html>` before the browser paints.

```tsx filename="app/layout.tsx" switcher
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

```jsx filename="app/layout.js" switcher
export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

```css filename="app/globals.css"
[data-theme='light'] {
  --background: #ffffff;
  --foreground: #000000;
}

[data-theme='dark'] {
  --background: #0a0a0a;
  --foreground: #ededed;
}
```

The script runs in `<head>`, so the correct theme is applied before any content is painted. The `try/catch` handles cases where `localStorage` is unavailable.

## Syncing with React state

When a Client Component manages interactive state (like which accordion section is open), React's initial state must match the DOM that the inline script set. Use a **lazy state initializer** that reads from the same source as the script.

```tsx filename="app/components/accordion.tsx" switcher
'use client'

import { useState, useCallback } from 'react'
import { InlineScript } from './inline-script'

const STORAGE_KEY = 'open-section'

const sections = [
  {
    id: 'setup',
    title: 'Setup',
    content: 'Install dependencies and create your project.',
  },
  {
    id: 'usage',
    title: 'Usage',
    content: 'Import the component and pass your data.',
  },
  {
    id: 'deploy',
    title: 'Deploy',
    content: 'Push to your Git provider and deploy.',
  },
]

const DEFAULT_ID = sections[0].id
const SECTION_IDS = sections.map((s) => s.id)

export function Accordion() {
  const [openId, setOpenId] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_ID
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_ID
  })

  const handleToggle = useCallback(
    (id: string) => (e: React.ToggleEvent<HTMLDetailsElement>) => {
      if (e.newState === 'open') {
        setOpenId(id)
        localStorage.setItem(STORAGE_KEY, id)
      }
    },
    []
  )

  return (
    <div>
      {sections.map((section) => (
        <details
          key={section.id}
          name="accordion"
          id={`section-${section.id}`}
          open={openId === section.id}
          onToggle={handleToggle(section.id)}
        >
          <summary>{section.title}</summary>
          <p>{section.content}</p>
        </details>
      ))}
      <InlineScript
        html={`{var id=localStorage.getItem("${STORAGE_KEY}")??"${DEFAULT_ID}";${JSON.stringify(SECTION_IDS)}.forEach(function(s){var el=document.getElementById("section-"+s);if(el){if(s===id)el.setAttribute("open","");else el.removeAttribute("open")}})}`}
      />
    </div>
  )
}
```

```jsx filename="app/components/accordion.js" switcher
'use client'

import { useState, useCallback } from 'react'
import { InlineScript } from './inline-script'

const STORAGE_KEY = 'open-section'

const sections = [
  {
    id: 'setup',
    title: 'Setup',
    content: 'Install dependencies and create your project.',
  },
  {
    id: 'usage',
    title: 'Usage',
    content: 'Import the component and pass your data.',
  },
  {
    id: 'deploy',
    title: 'Deploy',
    content: 'Push to your Git provider and deploy.',
  },
]

const DEFAULT_ID = sections[0].id
const SECTION_IDS = sections.map((s) => s.id)

export function Accordion() {
  const [openId, setOpenId] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_ID
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_ID
  })

  const handleToggle = useCallback(
    (id) => (e) => {
      if (e.newState === 'open') {
        setOpenId(id)
        localStorage.setItem(STORAGE_KEY, id)
      }
    },
    []
  )

  return (
    <div>
      {sections.map((section) => (
        <details
          key={section.id}
          name="accordion"
          id={`section-${section.id}`}
          open={openId === section.id}
          onToggle={handleToggle(section.id)}
        >
          <summary>{section.title}</summary>
          <p>{section.content}</p>
        </details>
      ))}
      <InlineScript
        html={`{var id=localStorage.getItem("${STORAGE_KEY}")??"${DEFAULT_ID}";${JSON.stringify(SECTION_IDS)}.forEach(function(s){var el=document.getElementById("section-"+s);if(el){if(s===id)el.setAttribute("open","");else el.removeAttribute("open")}})}`}
      />
    </div>
  )
}
```

The inline script and the lazy `useState` initializer both read from `localStorage`. They always agree, so React's initial state matches the DOM.

## When to use other approaches

| Situation                                       | Approach                                                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date depends on request data (cookies, headers) | Use [`headers()`](/docs/app/api-reference/functions/headers) or [`cookies()`](/docs/app/api-reference/functions/cookies) to read request data and format server-side |
| Date updates live (countdown timers, clocks)    | Use a Client Component with `useEffect` and `suppressHydrationWarning`                                                                                               |
| Page is already fully dynamic                   | Format the date on the server using the `Accept-Language` header                                                                                                     |
| Translating content between languages           | Use [internationalization](/docs/app/guides/internationalization) with per-locale static builds or dynamic rendering                                                 |

### Why not `useEffect`?

`useEffect` runs after hydration and paint. The user sees the server value first, then the correction. Setting state in an effect also triggers a re-render, which can reactivate parent Suspense boundaries.

`useLayoutEffect` runs before paint but after hydration. It prevents the flash between hydration and paint, but not the flash between the HTML arriving and React hydrating. On slow connections, the browser paints the server HTML before React has loaded. The inline script runs during HTML **parsing**, before React is involved.

### Why not read from headers or cookies at request time?

Reading `Accept-Language` with `await headers()` lets the server format per-request. With Cache Components, you can wrap just the date in a Suspense fallback so the rest of the page stays static. But you'd need to show a fallback instead of immediate content, and `Accept-Language` doesn't include timezone information.

## Next steps

- [Read cookies](/docs/app/api-reference/functions/cookies) or [headers](/docs/app/api-reference/functions/headers) when you need to format based on request data.
- [Configure internationalization](/docs/app/guides/internationalization) for multi-language support.
- [React hydration error](/docs/messages/react-hydration-error) for solutions to other common causes of hydration mismatches.
