---
title: How to use the Activity component in Next.js
nav_title: Activity
description: Learn how to use Activity in Next.js to preserve React and DOM state across hide/show cycles, enabling patterns like tabs, collapsible panels, and prerendering.
related:
  title: Related
  description: Activity works with Cache Components to enable instant navigation with preserved state.
  links:
    - app/getting-started/cache-components
    - app/api-reference/config/next-config-js/cacheComponents
---

You can find the resources used in this guide here:

- [Demo](https://react-activity-patterns.vercel.app/)
- [Code](https://github.com/vercel-labs/react-activity-patterns)

## Background

React 19.2 introduced the [`Activity`](https://react.dev/reference/react/Activity) component - a powerful primitive that allows developers to persist DOM elements and React state while visually hiding parts of the UI.

> **Good to know:** Activity in the App Router is available in **Next.js 16** and later, which includes React 19.2. See [Installation](/docs/app/getting-started/installation) for details on how Next.js manages React versions.

## How Activity works

Activity acts as a boundary, with two modes, `hidden` or `visible` (default). When set to `mode="hidden"`, it:

- Applies `display: none` to all children (DOM remains in the document)
- **Cleans up Effects** (runs cleanup functions)
- **Runs ref cleanup functions** (callback refs that return a cleanup function)
- Preserves React state and memoized values
- Re-renders in response to new props or context at **lower priority**
- **Skipped during SSR** - hidden content is not in the initial HTML payload, but React renders it client-side and adds it to the DOM

When the boundary becomes `mode="visible"` again, React reveals the children with their previous state restored and re-creates their Effects.

```tsx
'use client'

import { Activity, useState } from 'react'

function Dashboard() {
  const [isVisible, setIsVisible] = useState(true)
  const toggleSidebar = () => setIsVisible((state) => !state)

  return (
    <>
      <Activity mode={isVisible ? 'visible' : 'hidden'}>
        <Sidebar />
      </Activity>
      <Charts toggleSidebar={toggleSidebar} />
    </>
  )
}
```

When `isVisible` is `false`, the `Sidebar` is hidden but its DOM and React state remain intact. It still re-renders in response to new props or context changes, but at a lower priority than visible content. Toggling it back to `true` instantly reveals the sidebar in its previous state - scroll position, expanded sections, and any other internal state are all preserved.

### Why use Activity over a custom wrapper

You might wonder why not just wrap content in a `<div style={{ display: 'none' }}>`. Activity provides several advantages:

- **No extra DOM element**: A wrapper div can break valid HTML (e.g., inside `<ul>`), CSS layouts, and accessibility tooling
- **Effect lifecycle management**: React knows to clean up and restore Effects appropriately
- **Portals are also hidden**: Content rendered via portals (modals, tooltips) is correctly hidden along with the Activity
- **Selective Hydration**: Activity boundaries participate in React's hydration optimization
- **Future modes**: The API is designed to support additional modes beyond visible/hidden

## Persisting state

### DOM-managed state

Many HTML elements manage their own internal state: `<input>` and `<textarea>` values, `<details>` open/closed state, scroll position, video playback timecode, etc.

Consider a filters panel with expandable sections:

```tsx
'use client'

function FiltersPanel() {
  return (
    <aside>
      <details>
        <summary>Price Range</summary>
        <input type="range" min="0" max="1000" />
      </details>

      <details open>
        <summary>Categories</summary>
        <input type="text" placeholder="Search categories..." />
        {/* ... checkbox list */}
      </details>
    </aside>
  )
}
```

The `<details>` elements track their open/closed state, and the inputs hold user values. Now imagine a parent component that toggles the panel visibility:

```tsx
'use client'

import { useReducer } from 'react'

function ProductPage() {
  const [showFilters, toggle] = useReducer((x: boolean) => !x, true)

  return (
    <>
      <button onClick={toggle}>Toggle Filters</button>
      {showFilters && <FiltersPanel />}
    </>
  )
}
```

When `showFilters` becomes `false`, the panel unmounts and all DOM state is lost - which `<details>` were expanded, what the user typed, slider positions. With Activity, the DOM persists:

```tsx
'use client'

import { Activity, useReducer } from 'react'

function ProductPage() {
  const [showFilters, toggle] = useReducer((x: boolean) => !x, true)

  return (
    <>
      <button onClick={toggle}>Toggle Filters</button>
      <Activity mode={showFilters ? 'visible' : 'hidden'}>
        <FiltersPanel />
      </Activity>
    </>
  )
}
```

Now toggling the filters preserves everything - expanded sections, input values, scroll position.

### React-managed state

Without Activity, preserving state across hide/show cycles requires:

- **Lifting state up**: Moving state to a parent component that doesn't unmount
- **External stores**: Using context, Zustand, Redux, etc.

For DOM-managed state, you'd also need to explicitly control and sync it:

- Convert `<details>` to controlled with the `open` prop
- Track scroll position and restore it on remount
- Use controlled inputs for all form fields

This quickly adds up to significant boilerplate. Activity lets you keep state local to the component - both React state and DOM state - without any of this synchronization work.

## Patterns with Activity

### Avoiding state lift

Without Activity, to persist state across hide/show cycles, you must lift it to a parent that won't unmount:

```tsx
'use client'

import { useState } from 'react'

// Before: State lifted to parent
function Parent() {
  const [showEditor, setShowEditor] = useState(true)
  // State hoisted here to survive Editor unmounting
  const [draft, setDraft] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)

  return (
    <>
      <button onClick={() => setShowEditor((s) => !s)}>Toggle Editor</button>
      {showEditor && (
        <Editor
          draft={draft}
          onDraftChange={setDraft}
          cursorPosition={cursorPosition}
          onCursorChange={setCursorPosition}
        />
      )}
    </>
  )
}
```

The `Editor` can't own its own state - it would be destroyed on hide. With Activity, state stays local:

```tsx
'use client'

import { Activity, useState } from 'react'

// After: State stays in Editor
function Parent() {
  const [showEditor, setShowEditor] = useState(true)

  return (
    <>
      <button onClick={() => setShowEditor((s) => !s)}>Toggle Editor</button>
      <Activity mode={showEditor ? 'visible' : 'hidden'}>
        <Editor />
      </Activity>
    </>
  )
}

function Editor() {
  // State lives here - survives hide/show cycles
  const [draft, setDraft] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)

  return <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
}
```

The parent no longer needs to know about the editor's internal state. This keeps components encapsulated and reduces prop drilling.

### Tabs and navigation

A common pattern is offering multiple views of the same data - for example, a list view and a table view. Each view may have its own scroll position, sort order, or selected items.

```tsx
'use client'

import { Activity, useState } from 'react'

type DataItem = { id: number; name: string }

function DataViewer({ data }: { data: DataItem[] }) {
  const [view, setView] = useState<'list' | 'table'>('list')

  return (
    <>
      <div>
        <button onClick={() => setView('list')}>List View</button>
        <button onClick={() => setView('table')}>Table View</button>
      </div>

      <Activity mode={view === 'list' ? 'visible' : 'hidden'}>
        <ListView data={data} />
      </Activity>
      <Activity mode={view === 'table' ? 'visible' : 'hidden'}>
        <TableView data={data} />
      </Activity>
    </>
  )
}
```

Both views render and stay up to date with `data`. When you switch views:

- Scroll position in each view is preserved
- Sort order or column widths in `TableView` persist
- Selected items in `ListView` remain selected

Without Activity, switching views would unmount one and mount the other, losing all that state. For expensive component trees, this also means re-running all that rendering work on every switch - rebuilding memoized values, re-triggering data fetches, etc. With Activity, the component stays mounted and only re-renders when props or context actually change, not on every toggle.

This pattern extends naturally to route-level navigation. With Cache Components, Next.js uses Activity to preserve route states - when you navigate away and back, the previous route's ephemeral state (scroll position, form inputs, expanded sections) can be restored rather than reset.

### Prerendering hidden content

Activity can prerender content the user hasn't seen yet. Hidden boundaries render at lower priority. Combined with Suspense, this lets you prefetch data for content the user is likely to view next.

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

### Resetting state

Since Activity preserves state, you need to explicitly reset it when appropriate. Previously, conditional rendering (`{show && <Form />}`) or unmounting would reset state automatically. With Activity, you choose when to reset.

**Option 1: Reset immediately**

The simplest approach - reset state directly in an event handler:

```tsx
'use client'

import { useState } from 'react'

async function sendMessage(formData: FormData) {
  // Your send logic
}

function ContactForm() {
  const [message, setMessage] = useState('')

  async function handleSubmit(formData: FormData) {
    await sendMessage(formData)
    setMessage('') // Reset immediately after submission
  }

  return (
    <form action={handleSubmit}>
      <textarea
        name="message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button type="submit">Send</button>
    </form>
  )
}
```

**Option 2: Reset when hidden**

Use Effect cleanup to reset state when Activity hides the component. This lets you show a success message until the component is hidden:

```tsx
'use client'

import { useState, useRef, useLayoutEffect, useTransition } from 'react'

async function signUp(formData: FormData) {
  // Your signup logic
}

function NewsletterForm() {
  const [didSubmit, setDidSubmit] = useState(false)
  const [isPending, startTransition] = useTransition()
  const shouldResetRef = useRef(false)

  useLayoutEffect(() => {
    return () => {
      if (shouldResetRef.current) {
        setDidSubmit(false)
        shouldResetRef.current = false
      }
    }
  }, [])

  return (
    <div>
      {!didSubmit ? (
        <>
          <p>Sign up for my newsletter:</p>
          <form
            action={(formData) => {
              startTransition(async () => {
                shouldResetRef.current = true
                setDidSubmit(true)
                await signUp(formData)
              })
            }}
          >
            <input type="email" name="email" placeholder="Email" />
            <button type="submit" disabled={isPending}>
              {isPending ? 'Signing up...' : 'Sign up'}
            </button>
          </form>
        </>
      ) : (
        <p>Thanks for signing up!</p>
      )}
    </div>
  )
}
```

On submission, set `shouldResetRef.current = true` and show the success message. When Activity hides the component, the Effect cleanup runs and resets `didSubmit`. Next time the component becomes visible, the form is ready for a new submission.

> **Good to know:** If your components add global styles (like `overflow-hidden` on `<body>` for modals), ensure your Effects have proper cleanup functions. With Activity, these cleanups run when hidden - just as they would on unmount.

**Option 3: Reset with a key**

You can't always control whether an Activity boundary exists above your component - a parent, layout, or framework might wrap your content in Activity. If your component relied on unmounting to reset state, you can force a reset by changing its `key`. React treats a new key as an entirely new element, discarding the old subtree and mounting a fresh instance:

```tsx
'use client'

import { useState } from 'react'

function ResettableForm() {
  const [formKey, setFormKey] = useState(0)

  return (
    <>
      <button onClick={() => setFormKey((k) => k + 1)}>Reset Form</button>
      <ContactForm key={formKey} />
    </>
  )
}
```

When `formKey` changes, React discards the entire `ContactForm` subtree - all React state, DOM state, and child components are reset.

Use this sparingly while adopting proper cleanup patterns (Options 1 and 2). Key-based resets defeat Activity's preservation benefits and should be a temporary measure, not a general-purpose solution. See the React documentation on [resetting state with a key](https://react.dev/learn/preserving-and-resetting-state#option-2-resetting-state-with-a-key) and [resetting a form with a key](https://react.dev/learn/preserving-and-resetting-state#resetting-a-form-with-a-key) for more details.

## Caveats

### Effects and ref cleanups are run

Effects **are cleaned up** when an Activity becomes `hidden`. Callback refs that return cleanup functions also have their cleanups invoked. This is intentional - subscriptions and timers shouldn't run for hidden content.

> **Good to know**: "Effects" refers to React's [`useEffect`](https://react.dev/reference/react/useEffect) and [`useLayoutEffect`](https://react.dev/reference/react/useLayoutEffect) hooks. When Activity hides content, React runs the cleanup functions you return from these hooks, just as if the component were unmounting.

```tsx
'use client'

import { useEffect } from 'react'

function Timer() {
  // Cleanup runs when Activity becomes hidden
  useEffect(() => {
    const id = setInterval(() => console.log('tick'), 1000)
    return () => clearInterval(id) // Called on hide
  }, [])

  return (
    <div
      ref={(node) => {
        // Ref setup: runs when visible
        return () => {
          // Ref cleanup: runs on hide
        }
      }}
    />
  )
}
```

React state and `useRef` values persist across hide/show cycles - only the cleanup functions run. You can use these cleanups to reset state or clear DOM state (like input values or scroll position) when hiding.

For example, a form can use a callback ref to reset its fields when Activity hides it:

```tsx
<form
  ref={(form) => {
    // Cleanup function - runs when Activity hides this component
    return () => form?.reset()
  }}
>
  {/* fields */}
</form>
```

This means tracking "mount count" via Effects is misleading with Activity - Effects run on every hide-to-visible transition, not just the initial mount. If you need to distinguish the first mount from subsequent visibility changes, use a ref to track it:

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

The ref persists across hide/show cycles (refs aren't cleaned up), so `hasMountedRef.current` stays `true` after the first mount. Each time Activity becomes visible, the Effect runs again - but now it takes the `else` branch, letting you handle visibility changes differently from the initial mount.

### Media elements need explicit cleanup

Elements like `<video>`, `<audio>`, and `<iframe>` have side effects that persist even with `display: none`. Add explicit cleanup:

```tsx
'use client'

import { useLayoutEffect, useRef } from 'react'

function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useLayoutEffect(() => {
    const video = videoRef.current
    return () => {
      video?.pause()
    }
  }, [])

  return <video ref={videoRef} src={src} controls />
}
```

### Text-only children render nothing

If an Activity's children return only text (no DOM elements), nothing renders since there is no element to apply `display: none` to.

## Testing with Activity

Hidden Activity content has `display: none` but remains in the document. This affects end-to-end testing with tools like Playwright, Cypress, or Puppeteer:

- **DOM queries can find hidden elements** - Selectors may match elements regardless of visibility
- **Interactions with hidden elements fail or timeout** - Most tools wait for elements to become visible before interacting
- **Assertions may match hidden content** - Be explicit about visibility when asserting element presence

For example, with a tabs component using Activity, both the visible and hidden tab panels exist in the DOM. A query like `page.getByText('Product Name')` could match elements in both panels.

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

`getByRole` is robust to Activity, tabbed navigation, accordions, and any other pattern that keeps hidden content in the DOM. It queries the accessibility tree, which excludes hidden elements. For other testing tools, check their documentation for visibility-aware selectors - Cypress uses `.should('be.visible')` or `{ visible: true }` options.

## Activity with Cache Components

When using Activity with [Cache Components](/docs/app/getting-started/cache-components) navigation, some patterns that relied on component unmounting may behave differently. See [Activity with Cache Components](/docs/app/guides/activity-cache-components) for handling common patterns like dropdowns, dialogs, and testing.
