---
title: How Next.js preserves UI state with Activity
nav_title: Preserving UI state
description: Learn how React's Activity component preserves UI state across navigations in Next.js and how to control what resets.
related:
  title: Related
  description: Learn more about Cache Components and preserving UI state.
  links:
    - app/getting-started/caching
    - app/guides/migrating-to-cache-components
---

> **Good to know:** This guide assumes [Cache Components](/docs/app/getting-started/caching) is enabled. Enable it by setting [`cacheComponents: true`](/docs/app/api-reference/config/next-config-js/cacheComponents) in your Next config file.

Before Cache Components, preserving page-level state across navigations required workarounds like hoisting state to a [shared layout](/docs/app/getting-started/layouts-and-pages#nesting-layouts) or using an external store. With Cache Components, Next.js preserves state and DOM out of the box.

Instead of unmounting pages on navigation, Next.js hides them using React's [`<Activity>`](https://react.dev/reference/react/Activity) component. Activity keeps the DOM in the document (hidden with `display: none`), so both React state and DOM state are preserved: form drafts, scroll positions, expanded `<details>` elements, video playback progress, and more.

Next.js preserves up to 3 routes. Beyond that, the oldest route is evicted and will re-render fresh.

> **Good to know:** Opt-out strategies are being considered for gradual migration.

## Choosing what to preserve

Activity preserves all component state and DOM state by default. For each piece of state, you decide whether that's the right behavior for your UI. The patterns below show common scenarios and how to handle both sides.

### Expandable UI (dropdowns, accordions, panels)

When a user navigates away and returns, Activity preserves the open/closed state of expandable elements.

**When to keep it:** A sidebar with expanded sections, a FAQ accordion, or a filters panel. The user set up their view intentionally, and restoring it avoids re-doing that work.

**When to reset it:** A dropdown menu or popover triggered by a button click. These are transient interactions, not persistent view state. Returning to a page with a dropdown already open is not user friendly.

To reset transient open/closed state, close it in a `useLayoutEffect` cleanup function:

```tsx highlight={8-13}
'use client'

import { useState, useLayoutEffect } from 'react'

function SettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false)

  // Close dropdown when this component becomes hidden
  useLayoutEffect(() => {
    return () => {
      setIsOpen(false)
    }
  }, [])

  return (
    <div>
      <button onClick={() => setIsOpen((o) => !o)}>Options</button>
      {isOpen && (
        <ul>
          <li>
            <button>Edit Profile</button>
          </li>
          <li>
            <button>Change Password</button>
          </li>
        </ul>
      )}
    </div>
  )
}
```

When Activity hides this component, the cleanup function runs and resets `isOpen`. When the page becomes visible again, the dropdown is closed. Using `useLayoutEffect` ensures the cleanup runs synchronously before the component is hidden, avoiding any flash of stale state.

You can also use `Link`'s [`onNavigate`](/docs/app/api-reference/components/link#onnavigate) callback to close dropdowns immediately when a navigation link is clicked.

### Dialog and initialization logic

Activity preserves dialog open/closed state. This also affects Effects that run based on that state.

**When to keep it:** A multi-step wizard or a settings panel that the user was actively working in. Preserving the step and input state avoids losing progress.

**When to reset it:** A dialog that runs initialization logic (like focusing an input) each time it opens. If the user navigated away while the dialog was open, Activity preserves `isDialogOpen: true`. Opening it again sets it to `true` when it's already `true`, so no state change happens and the Effect doesn't re-run.

Consider this example:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'

function ProductTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isDialogOpen) {
      inputRef.current?.focus()
    }
  }, [isDialogOpen])

  // ...
}
```

If the user navigated away while the dialog was open, returning and opening the dialog won't trigger the focus Effect because `isDialogOpen` was already `true`.

To fix this, derive the dialog state from something outside the preserved component state like a search param:

```tsx highlight={3,7-9,20,25}
'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

function ProductTab() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isDialogOpen = searchParams.get('edit') === 'true'
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isDialogOpen) {
      inputRef.current?.focus()
    }
  }, [isDialogOpen])

  return (
    <div>
      <button onClick={() => router.push('?edit=true')}>Edit Product</button>

      {isDialogOpen && (
        <dialog open>
          <input ref={inputRef} placeholder="Product name" />
          <button onClick={() => router.replace('?', { scroll: false })}>
            Close
          </button>
        </dialog>
      )}
    </div>
  )
}
```

With this approach, `isDialogOpen` derives from the URL rather than component state. When navigating away and returning, the search param is cleared (the URL changed), so `isDialogOpen` becomes `false`. Opening the dialog sets the param, which changes `isDialogOpen` and triggers the Effect.

### Forms, inputs, and state

Activity preserves form input values (text fields, selected options, checkbox states), submission results, and status messages across navigations.

**When to keep it:** A search page with filters, a draft the user was composing, or a settings form with unsaved changes. Preserving input state is one of the biggest UX wins because the user doesn't lose work.

**When to reset it:** A "new transaction" flow where each visit should start fresh, or a form where stale success/error messages would be confusing in a new context.

#### Resetting form state on submit

Consider a page where the user creates a new item. After submitting, `router.push` navigates to the new record. Since Activity preserves the page, navigating back shows the previous name still in the form. Reset state in the event handler to keep the form fresh:

```tsx filename="app/new/page.tsx" highlight={13}
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewItemPage() {
  const [name, setName] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const item = await createItem({ name })
    setName('')
    router.push(`/items/${item.id}`)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit">Create</button>
    </form>
  )
}
```

#### Resetting stale status messages

If after submitting you set a status into state to render a feedback message, there's often not a reliable user-initiated event to clear it.

The user might navigate via `next/link` elements out of your control, or via browser controls.

Navigating back to the form shows a stale message. In this case, you may use a `useLayoutEffect` cleanup to reset the form and state:

```tsx highlight={17-26}
'use client'

import { useState, useRef, useLayoutEffect } from 'react'

function ContactForm() {
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const shouldReset = useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await sendMessage({ name })
    setStatus('success')
    shouldReset.current = true
  }

  // Reset stale success message when Activity hides this component
  useLayoutEffect(() => {
    return () => {
      if (shouldReset.current) {
        shouldReset.current = false
        setStatus('idle')
        setName('')
      }
    }
  }, [])

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit">Send</button>
      {status === 'success' && <p>Message sent!</p>}
    </form>
  )
}
```

The `shouldReset` ref ensures the cleanup only runs after a successful submission. If the user navigates away mid-draft without submitting, their input is preserved.

If you use [`useActionState`](https://react.dev/reference/react/useActionState), the same approach applies. See [Reset state](https://react.dev/reference/react/useActionState#reset-state) in the React docs for how to add a `RESET` action to your reducer.

<details>
<summary>Resetting all form fields with a callback ref</summary>

You can use a callback ref to call `form.reset()` when Activity hides the component:

```tsx
<form
  ref={(form) => {
    return () => form?.reset()
  }}
>
  <input name="email" />
  <input name="message" />
  <button type="submit">Send</button>
</form>
```

This resets all fields whenever the user navigates away.

</details>

## State and authentication

Activity preserves local component state (`useState`, DOM input values) across navigations, including authentication changes. This is standard React behavior: props changing (such as receiving a new user) triggers a re-render but does not reset existing state. A draft composed by one user shouldn't be visible to another.

For logout flows, using `window.location.href` instead of `router.push` triggers a full page reload, clearing all client-side state.

To reset specific state when the user changes without a full reload:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'

function UserScopedForm({ userId }: { userId: string | null }) {
  const [draft, setDraft] = useState('')
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastUserIdRef.current !== null && lastUserIdRef.current !== userId) {
      setDraft('') // Reset on user change
    }
    lastUserIdRef.current = userId
  }, [userId])

  return <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
}
```

Alternatively, key components by user ID to let React handle the reset: `<Form key={userId} />`.

## Global styles

Page-level styles (CSS variables, z-index, global classes) can affect visible pages when the originating component is hidden by Activity. You likely want to disable them when hidden: a hidden page's accent color or z-index overrides shouldn't leak into the visible page.

Use a callback ref to toggle the stylesheet's `media` attribute:

```tsx
<style
  ref={(style) => {
    if (style) style.media = '' // Enable when visible
    return () => {
      if (style) style.media = 'not all' // Disable when hidden
    }
  }}
>
  {`:root { --page-accent: blue; }`}
</style>
```

Or use `useLayoutEffect` when managing multiple style elements or more complex cleanup:

```tsx
'use client'

import { useLayoutEffect, useRef } from 'react'

function PageWithStyles() {
  const styleRef = useRef<HTMLStyleElement>(null)

  useLayoutEffect(() => {
    if (styleRef.current) styleRef.current.media = ''
    return () => {
      if (styleRef.current) styleRef.current.media = 'not all'
    }
  }, [])

  return <style ref={styleRef}>{`:root { --page-accent: blue; }`}</style>
}
```

When Activity hides the component, the cleanup sets `media="not all"`, which disables the stylesheet. When visible again, the effect re-runs and resets `media` to enable it.

## Testing

Hidden Activity content has `display: none` but remains in the document. This applies both to routes preserved by Cache Components and to content you hide with `<Activity>` directly. It affects end-to-end testing with tools like Playwright, Cypress, or Puppeteer:

- **DOM queries can find hidden elements.** Selectors may match elements regardless of visibility.
- **Interactions with hidden elements fail or timeout.** Most tools wait for elements to become visible before interacting.
- **Assertions may match hidden content.** Be explicit about visibility when asserting element presence.

### Use visibility-aware selectors

In Playwright, `getByRole` queries automatically filter by visibility:

```ts
// Good - getByRole filters by visibility automatically
await page.getByRole('button', { name: 'Submit' }).click()
await page.getByRole('textbox', { name: 'Email' }).fill('test@example.com')

// Also good - getByLabel, getByPlaceholder filter by visibility
await page.getByLabel('Email').fill('test@example.com')
await page.getByPlaceholder('Search...').fill('query')
```

When `getByRole` isn't suitable, use `.locator()` with visibility filtering:

```ts
// Fallback - filter by visibility explicitly
await page.locator('.product-card').filter({ visible: true }).first().click()
await page
  .locator('[data-testid="timer"]')
  .filter({ visible: true })
  .textContent()

// Avoid - may match hidden elements in Activity boundaries
await page.locator('.product-card').first().click()
```

`getByRole` is robust to Activity, tabbed navigation, accordions, and any other pattern that keeps hidden content in the DOM. It queries the accessibility tree, which excludes hidden elements. For other testing tools, check their documentation for visibility-aware selectors. For example, Cypress uses `.should('be.visible')` or `{ visible: true }` options.

## Using Activity in your components

Cache Components uses Activity automatically at the route level, but you can also use `<Activity>` directly in your own components. This is useful for tabs, expandable panels, or any UI where you want to hide content without unmounting it.

### Prerendering hidden content

Activity can prerender content the user hasn't seen yet. Hidden boundaries render at lower priority. Combined with Suspense, this lets you prefetch data for content the user is likely to view next.

A Server Component can start fetching data immediately and pass the promise to a client component. The client component uses Activity to hide the content until the user requests it, and `use()` to resolve the promise when rendering:

```tsx filename="app/page.tsx"
import { Suspense } from 'react'
import { ExpandableComments } from './expandable-comments'

async function getCommentsData() {
  return db.comments.findMany()
}

export default function Page() {
  const commentsPromise = getCommentsData()

  return (
    <article>
      <h1>Post Title</h1>
      <p>Main content visible immediately...</p>

      <ExpandableComments commentsPromise={commentsPromise} />
    </article>
  )
}
```

```tsx filename="app/expandable-comments.tsx"
'use client'

import { Activity, Suspense, useState, use } from 'react'

type Comment = { id: string; text: string; author: string }

export function ExpandableComments({
  commentsPromise,
}: {
  commentsPromise: Promise<Comment[]>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <button onClick={() => setExpanded((e) => !e)}>
        {expanded ? 'Hide Comments' : 'Show Comments'}
      </button>

      <Activity mode={expanded ? 'visible' : 'hidden'}>
        <Suspense fallback={<CommentsSkeleton />}>
          <Comments commentsPromise={commentsPromise} />
        </Suspense>
      </Activity>
    </>
  )
}

function Comments({
  commentsPromise,
}: {
  commentsPromise: Promise<Comment[]>
}) {
  const comments = use(commentsPromise)
  return (
    <ul>
      {comments.map((c) => (
        <li key={c.id}>{c.text}</li>
      ))}
    </ul>
  )
}

function CommentsSkeleton() {
  return <div>Loading comments...</div>
}
```

The Server Component starts fetching comments immediately and passes the promise down. While hidden, the data streams at lower priority. When the user clicks "Show Comments", the `Comments` component resolves the promise with `use()` and the content appears instantly.

### Effect and media cleanup

When Activity hides content, React runs effect cleanup functions just like it does on unmount. This means timers, subscriptions, and media playback pause automatically if you have proper cleanup:

```tsx
'use client'

import { useEffect, useState } from 'react'

function LiveTimer() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + 1), 1000)
    return () => clearInterval(id) // Pauses when hidden
  }, [])

  return <p>Count: {count}</p>
}
```

For media elements like `<video>` and `<audio>`, `display: none` does not stop playback. Add explicit cleanup with `useLayoutEffect`:

```tsx
'use client'

import { useLayoutEffect, useRef } from 'react'

function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useLayoutEffect(() => {
    const video = videoRef.current
    return () => {
      video?.pause() // Pauses when hidden, preserves playback position
    }
  }, [])

  return <video ref={videoRef} src={src} controls />
}
```

When the component becomes visible again, effects re-run and playback position is preserved since the DOM node was never removed.

### Distinguishing first mount from re-show

Effects run on every hide-to-visible transition, not just the initial mount. If you need to distinguish the first mount from subsequent visibility changes, use a ref:

```tsx
'use client'

import { useEffect, useRef } from 'react'

function TrackedComponent() {
  const hasMountedRef = useRef(false)

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      console.log('First mount')
    } else {
      console.log('Became visible again')
    }
  }, [])

  return <div>...</div>
}
```

The ref persists across hide/show cycles (refs aren't cleaned up), so `hasMountedRef.current` stays `true` after the first mount. Each time Activity becomes visible, the Effect runs again, but now it takes the `else` branch.

## Examples

The [Activity Patterns Demo](https://react-activity-patterns.labs.vercel.dev) ([source](https://github.com/vercel-labs/react-activity-patterns)) is a Next.js app with Cache Components enabled and three routes. Navigate between them to see state preservation in action:

- **Data** — sortable table and selectable list that keep their state across navigations, plus a reviews section that prerenders in the background
- **Forms** — filter panel with DOM state (`<details>`, checkboxes, text inputs) that persists, and a newsletter form that resets after submission using `useLayoutEffect` cleanup
- **Side Effects** — a live timer that pauses when you navigate away and resumes when you return, and a video player that auto-pauses with playback position preserved
