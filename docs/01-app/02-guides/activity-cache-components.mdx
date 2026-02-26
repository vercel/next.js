---
title: Activity with Cache Components
nav_title: Activity with Cache Components
description: Learn how to decide which UI state to preserve and which to reset when Cache Components keeps routes mounted with Activity.
related:
  title: Related
  description: Learn more about Activity and Cache Components.
  links:
    - app/getting-started/cache-components
    - app/guides/activity
---

When [Cache Components](/docs/app/getting-started/cache-components) is enabled, routes don't unmount when you navigate away from them. Instead, Next.js uses React's [`<Activity>`](https://react.dev/reference/react/Activity) component to hide them - setting them to `mode="hidden"` rather than removing them from the tree.

This preserves component state and DOM state, which is great for back/forward navigation. But patterns that relied on unmounting to clear state will no longer reset automatically. You decide what to keep and what to reset.

Next.js uses a **3-entry limit** - it preserves up to 3 routes. When you navigate beyond that, the oldest route's DOM and React state are dropped. This means if a user navigates through many pages and then goes back, very old states may have been evicted and will re-render fresh.

### Why Activity ships with Cache Components

Cache Components and Activity work together to enable SPA-like navigation - instant route transitions without sacrificing server rendering:

- **Server Components** use `"use cache"` to extend their lifetime, enabling prefetching and instant route transitions
- **Client Components** use Activity to preserve their state and DOM across navigations - without it, form inputs, scroll positions, and component state would reset on every navigation

This foundation enables full route prefetching, instant back/forward navigation, and upcoming features like View Transitions and Gesture APIs.

> **Good to know:** Opt-out strategies are being considered for gradual migration.

If you want to understand how Activity works and the patterns it enables, see the [Activity guide](/docs/app/guides/activity).

## Choosing what to preserve

Activity preserves all component state by default. For each piece of state, you decide whether that's the right behavior for your UI. The patterns below show common scenarios and how to handle both sides.

### Expandable UI (dropdowns, accordions, panels)

When a user navigates away and returns, Activity preserves the open/closed state of expandable elements.

**When to keep it:** A sidebar with expanded sections, a FAQ accordion, or a filters panel - the user set up their view intentionally, and restoring it avoids re-doing that work.

**When to reset it:** A dropdown menu or popover triggered by a button click - these are transient interactions, not persistent view state. Returning to a page with a dropdown already open is not user friendly.

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

**When to keep it:** A multi-step wizard or a settings panel that the user was actively working in - preserving the step and input state avoids losing progress.

**When to reset it:** A dialog that runs initialization logic (like focusing an input) each time it opens. If the user navigated away while the dialog was open, Activity preserves `isDialogOpen: true`. Opening it again sets it to `true` when it's already `true` - no state change means the Effect doesn't re-run.

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

### Form input values

Activity preserves form input values - text typed into fields, selected options, checkbox states.

**When to keep it:** A search page with filters, a draft the user was composing, or a settings form with unsaved changes. Preserving input state is one of Activity's biggest UX wins - the user doesn't lose work.

**When to reset it:** A "create new item" page where returning should start fresh, or a contact form after successful submission.

To reset form fields when Activity hides the component, use a callback ref:

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

This resets the form whenever the user navigates away. See [Resetting state](/docs/app/guides/activity#resetting-state) in the Activity guide for more patterns, including key-based resets for React state.

### Action state (`useActionState`)

Activity preserves [`useActionState`](https://react.dev/reference/react/useActionState) results - success messages, error messages, and any other state returned by the action.

**When to keep it:** A ticket redemption form showing "Ticket redeemed successfully", or a settings form showing "Changes saved". Seeing the result of a previous action when returning to the page is useful confirmation so the user can see what happened.

**When to reset it:** A "new transaction" flow where each visit should start fresh, or a form where stale success/error messages would be confusing in a new context.

You can think of `useActionState` as a `useReducer` that allows side effects. It doesn't have to only handle form submissions - you can dispatch any action to it. Adding a `RESET` action gives you a clean way to clear state when Activity hides the component (see [Reset state](https://react.dev/reference/react/useActionState#reset-state) in the React docs):

```tsx highlight={5-6,9-21,26-35}
'use client'

import { useActionState, useLayoutEffect, useRef, startTransition } from 'react'

type Action = { type: 'SUBMIT'; data: FormData } | { type: 'RESET' }
type State = { success: boolean; error: string | null }

function CommentForm() {
  const [state, dispatch, isPending] = useActionState(
    async (prev: State, action: Action) => {
      if (action.type === 'RESET') {
        return { success: false, error: null }
      }
      // Handle the form submission
      const res = await saveComment(action.data)
      if (!res.ok) return { success: false, error: res.message }
      shouldReset.current = true
      return { success: true, error: null }
    },
    { success: false, error: null }
  )

  const shouldReset = useRef(false)

  // Dispatch RESET when Activity hides this component
  useLayoutEffect(() => {
    return () => {
      if (shouldReset.current) {
        shouldReset.current = false
        startTransition(() => {
          dispatch({ type: 'RESET' })
        })
      }
    }
  }, [dispatch])

  return (
    <form action={(formData) => dispatch({ type: 'SUBMIT', data: formData })}>
      <textarea name="comment" />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Posting...' : 'Post Comment'}
      </button>
      {state.success && <p>Comment posted!</p>}
      {state.error && <p>{state.error}</p>}
    </form>
  )
}
```

Here's what happens step by step:

1. The user submits the form. The reducer receives a `SUBMIT` action with the `FormData`, calls `saveComment`, and returns `{ success: true }`. It also sets `shouldReset.current = true` to mark that a reset is needed.
2. The user navigates away. Activity hides the component and runs the `useLayoutEffect` cleanup. Because `shouldReset.current` is `true`, it dispatches a `RESET` action.
3. The reducer receives `RESET` and returns the initial state (`{ success: false, error: null }`). The stale success message is cleared.
4. If the user navigates back, the form is ready for a new submission. If they never submitted (step 1 didn't happen), `shouldReset.current` is still `false`, so no `RESET` is dispatched. The form stays as-is.

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

Alternatively, key components by user ID to let React handle the reset: `<Form key={userId} />`. See [Resetting state](/docs/app/guides/activity#resetting-state) for more patterns.

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
