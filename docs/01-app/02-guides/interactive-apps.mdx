---
title: Building interactive apps
description: Learn how to build responsive interactions with Server Functions, transitions, optimistic UI, and pending feedback.
nav_title: Interactive apps
related:
  description: Learn more about the APIs used in this guide.
  links:
    - app/api-reference/functions/refresh
    - app/api-reference/directives/use-cache
    - app/api-reference/functions/cacheTag
    - app/api-reference/functions/updateTag
---

When a user interaction requires server-side work, the result is not available immediately. Network requests take an unknown amount of time to complete and may succeed or fail. While waiting, the client should provide feedback and respond to those states. Otherwise, users are left looking at stale data and may wonder whether anything is happening.

This guide adds responsive feedback to a task management app called _Taskboard_. Each step handles a different kind of pending work, from streaming slow reads to confirming mutations before the server responds.

> **Good to know:** The patterns in this guide also improve [Core Web Vitals](https://web.dev/articles/vitals). Streaming with [`<Suspense>`](https://react.dev/reference/react/Suspense) lowers [FCP](https://web.dev/articles/fcp) and [LCP](https://web.dev/articles/lcp) by letting the shell paint while slow reads finish. Optimistic UI and transitions lower [INP](https://web.dev/articles/inp) by keeping the click frame fast. Prefetching the next route makes FCP, LCP, and INP on the destination page near-instant. These patterns help, but they don't replace the usual INP work: shipping less client JavaScript and avoiding blocking roundtrips during interactions.

## Example

The patterns build in order: stream slow data behind loading boundaries, add an instant priority toggle, build a reusable filter with a callback prop, show comments before they're confirmed, move cards between columns on drop, manage form lifecycle in a create dialog, and signal pending deletion to a parent. The final step caches the reusable reads so navigations stay instant.

The companion [Taskboard demo](https://async-react-demo.labs.vercel.dev) ([source](https://github.com/vercel-labs/async-react-demo)) lets you see each pattern from this guide in action.

The app is organized by feature. Everything for the task domain (queries, Server Functions, and components) lives under `features/task/`. Shared UI primitives live in `components/ui/`, and pages in `app/` compose feature components. The file paths throughout this guide follow that structure.

The starting point is a Server Component app that reads tasks and comments from a database, with no [`<Suspense>`](/docs/app/guides/streaming) boundaries and no caching. Client Components call [Server Functions](/docs/app/getting-started/mutating-data) to mutate that data. After each mutation, the Server Function calls [`refresh()`](/docs/app/api-reference/functions/refresh) so the server re-renders with fresh data:

```ts filename="features/task/task-actions.ts"
'use server'

import { refresh } from 'next/cache'
import { PRIORITY_CYCLE } from '@/lib/data'
import { getTaskById, updateTaskPriority } from '@/lib/db'

export async function cyclePriority(taskId: string) {
  const task = await getTaskById(taskId)
  if (!task) return null
  const newPriority = PRIORITY_CYCLE[task.priority]
  await updateTaskPriority(taskId, newPriority)
  refresh()
  return newPriority
}
```

### Step 1: Stream slow data with Suspense

The task detail page reads the task and its comments. When both are awaited at the top of the page component, the whole page blocks until the slowest read resolves.

```tsx filename="app/task/[id]/page.tsx"
import { getTask } from '@/features/task/task-queries'
import { TaskDetail } from '@/features/task/components/task-detail'
import { CommentSection } from '@/features/task/components/comment-section'

export default async function TaskPage({ params }) {
  const { id } = await params
  const task = await getTask(id)

  return (
    <div>
      <TaskDetail task={task} />
      <CommentSection taskId={id} />
    </div>
  )
}
```

With this version, nothing renders until `getTask` resolves, and the comments read starts only after that.

Split the reads into separate components, pass each one a promise, and wrap them in [`<Suspense>`](https://react.dev/reference/react/Suspense). The page becomes synchronous, returns the shell immediately, and the server streams each section in as its data resolves:

```tsx filename="app/task/[id]/page.tsx"
import { Suspense } from 'react'
import {
  TaskDetail,
  TaskDetailSkeleton,
} from '@/features/task/components/task-detail'
import {
  CommentSection,
  CommentSectionSkeleton,
} from '@/features/task/components/comment-section'

export default function TaskPage({ params }) {
  return (
    <div>
      <Suspense fallback={<TaskDetailSkeleton />}>
        {params.then(({ id }) => (
          <>
            <TaskDetail id={id} />
            <Suspense fallback={<CommentSectionSkeleton />}>
              <CommentSection taskId={id} />
            </Suspense>
          </>
        ))}
      </Suspense>
    </div>
  )
}
```

Each section component awaits its own data:

```tsx filename="features/task/components/task-detail.tsx"
export async function TaskDetail({ id }) {
  const task = await getTask(id)
  return <TaskHeader task={task} />
}
```

Calling `params.then()` inline in JSX keeps the page synchronous. The outer `<Suspense>` covers the params resolution and the task detail read. Once `TaskDetail` resolves, React reveals the task header and the nested `<Suspense>` boundary, which shows `CommentSectionSkeleton` while comments load.

The page shell now paints immediately, the task header streams in when `getTask` resolves, and the comments section follows when `getComments` resolves.

For more on streaming patterns, see the [Streaming](/docs/app/guides/streaming) guide.

### Step 2: Respond instantly to a toggle

Each task card has a priority indicator that cycles through low, medium, and high on click.

The button renders the `priority` prop from the server. Calling a Server Function starts the mutation, but it doesn't change that prop in the current render.

Here the Server Function is called directly:

```tsx filename="features/task/components/task-card.tsx"
'use client'

import { cyclePriority } from '@/features/task/task-actions'

export function TaskCard({ id, priority }) {
  return (
    <button onClick={() => cyclePriority(id)} className={priorityDot[priority]}>
      {priority}
    </button>
  )
}
```

If you click the dot, the Server Function runs, but the button keeps rendering the old `priority` prop until the next server render arrives.

Replace the direct call with [`useOptimistic`](https://react.dev/reference/react/useOptimistic) and [`useTransition`](https://react.dev/reference/react/useTransition). `useOptimistic` provides a value to render in place of the stale prop, and `useTransition` runs the Server Function as part of a transition. The optimistic value applies for as long as that transition is pending:

```tsx filename="features/task/components/task-card.tsx"
'use client'

import { useOptimistic, useTransition } from 'react'
import { cyclePriority } from '@/features/task/task-actions'
import { PRIORITY_CYCLE } from '@/lib/data'

export function TaskCard({ id, priority }) {
  const [optimisticPriority, setOptimisticPriority] = useOptimistic(priority)
  const [, startTransition] = useTransition()

  function handlePriority() {
    startTransition(async () => {
      setOptimisticPriority(PRIORITY_CYCLE[optimisticPriority])
      await cyclePriority(id)
    })
  }

  return (
    <button
      onClick={handlePriority}
      className={priorityDot[optimisticPriority]}
    >
      {optimisticPriority}
    </button>
  )
}
```

The `setOptimisticPriority` call updates the UI on the current frame with the next value in the cycle. Reading from `optimisticPriority` instead of the prop means rapid double-clicks cycle correctly rather than reading a stale closure value.

When the transition ends and fresh data arrives, the optimistic value reverts to the new server-rendered prop. If the Server Function inside `useTransition` throws, the error is forwarded to the nearest [error boundary](/docs/app/api-reference/file-conventions/error) without a manual `try`/`catch`.

The color now changes the moment the mouse lifts. Clicking again cycles to the next value without waiting for the first mutation to finish.

### Step 3: Filter with pending feedback

The board has label filter chips (Design, Frontend, Backend). Clicking a chip updates a query param to filter the task list.

The selected filter comes from the URL. Calling `router.push()` starts a client navigation, and the server re-renders the board with the new search params. Until that navigation completes, the page keeps rendering the old URL state.

Here `router.push()` is called directly:

```tsx filename="features/task/components/label-filter.tsx"
'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function LabelFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleFilter(value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('label', value)
    else params.delete('label')
    router.push(`/?${params.toString()}`)
  }

  // ...render chips with onClick={handleFilter}
}
```

With this version, `router.push()` starts the navigation, but there's no local pending state. The chip keeps rendering the old URL value, and the board gives no sign that a new server render is loading.

Separate the filter into two components. `LabelFilter` owns the query string update and passes the navigation callback to a reusable `ChipGroup`, which handles all the pending feedback:

```tsx filename="features/task/components/label-filter.tsx"
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ChipGroup } from '@/components/ui/chip-group'

const labels = [
  { label: 'Design', value: 'design' },
  { label: 'Frontend', value: 'frontend' },
  { label: 'Backend', value: 'backend' },
]

export function LabelFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('label') ?? null

  function filterAction(value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('label', value)
    } else {
      params.delete('label')
    }
    router.push(`/?${params.toString()}`)
  }

  return (
    <ChipGroup items={labels} value={current} changeAction={filterAction} />
  )
}
```

`LabelFilter` decides where the app navigates and holds no pending state of its own.

#### Handle pending feedback internally

`ChipGroup` accepts a `changeAction` prop and calls it inside its own `startTransition`. It uses two `useOptimistic` hooks: one for the selected chip, and one for the `data-pending` attribute that ancestor components can style against:

```tsx filename="components/ui/chip-group.tsx"
'use client'

import { startTransition, useOptimistic } from 'react'

export function ChipGroup({ items, value, changeAction }) {
  const [optimisticValue, setOptimisticValue] = useOptimistic(value)
  const [isPending, setIsPending] = useOptimistic(false)

  function handleClick(newValue) {
    startTransition(async () => {
      setOptimisticValue(newValue)
      setIsPending(true)
      await changeAction(newValue)
    })
  }

  return (
    <div className="flex gap-1.5" data-pending={isPending ? '' : undefined}>
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() =>
            handleClick(item.value === optimisticValue ? null : item.value)
          }
          className={item.value === optimisticValue ? 'active' : ''}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
```

The consumer passes a callback (`changeAction`), and the design component runs it inside a transition. By convention, props named `action` or suffixed with `Action` signal this behavior. See [Exposing `action` props from components](https://react.dev/reference/react/useTransition#exposing-action-props-from-components) in the React docs for this pattern.

The `data-pending` attribute on the `ChipGroup` root element lets ancestor components react through CSS without any coordination. The board on the home page uses `group-has-data-pending:opacity-50` to dim while the transition runs, without replacing the board with a skeleton. Because `ChipGroup` renders inside the `group` element, the attribute is available to any ancestor for styling.

The "Frontend" chip now highlights on the current frame. The board dims while the filtered data loads, then updates with the filtered tasks.

### Step 4: Add comments with instant feedback

The task detail page has a comment section. Submitting a comment writes new data on the server, but a server component renders the persisted list, so it can't include the new comment until the next server render arrives.

Here a comment form uses controlled state for the input and calls the Server Function directly:

```tsx filename="features/task/components/comment-form.tsx"
'use client'

import { useState } from 'react'
import { addComment } from '@/features/task/task-actions'

export function CommentForm({ taskId }) {
  const [content, setContent] = useState('')

  async function handleSubmit() {
    if (!content.trim()) return
    await addComment(taskId, content)
    setContent('')
  }

  return (
    <div>
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a comment..."
      />
      <button onClick={handleSubmit}>Send</button>
    </div>
  )
}
```

With this version, the Server Function runs on submit, but the input stays filled and the list doesn't change until the server responds.

Split the comment list into two parts. A server component renders the persisted comments, and a client component tracks only the **pending** comments using `useOptimistic([])` with an empty initial array. When the transition completes and a new render arrives with fresh data, the pending list resets to empty and the real comment appears in the server-rendered list:

```tsx filename="features/task/components/optimistic-comments.tsx"
'use client'

import { useOptimistic, useRef } from 'react'
import { addComment } from '@/features/task/task-actions'
import { CommentCard } from './comment-card'

export function OptimisticComments({ taskId }) {
  const [pendingComments, setPendingComments] = useOptimistic([])
  const formRef = useRef(null)

  return (
    <>
      <form
        ref={formRef}
        action={async (formData) => {
          const content = formData.get('content')?.trim()
          if (!content) return
          formRef.current?.reset()

          const id = crypto.randomUUID()
          setPendingComments((current) => [
            {
              id,
              content,
              userName: 'You',
              createdAt: new Date().toISOString(),
            },
            ...current,
          ])

          await addComment(taskId, content)
        }}
      >
        <input name="content" placeholder="Write a comment..." required />
        <button type="submit">Send</button>
      </form>
      {pendingComments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} pending />
      ))}
    </>
  )
}
```

Three things happen on submit:

1. `formRef.current?.reset()` clears the input through direct DOM manipulation. Inside a transition, [`useState`](https://react.dev/reference/react/useState) setters are deferred until the transition completes, but `useOptimistic` setters and direct DOM calls like `formRef.reset()` apply on the current frame.
2. `setPendingComments` adds the new comment to the pending list with a client-generated UUID.
3. The form `action` runs the handler inside a transition.

The server component renders the real list alongside it:

```tsx filename="features/task/components/comment-section.tsx"
import { getComments } from '@/features/task/task-queries'
import { CommentCard } from './comment-card'
import { OptimisticComments } from './optimistic-comments'

async function CommentSection({ taskId }) {
  const comments = await getComments(taskId)

  return (
    <div>
      <OptimisticComments taskId={taskId} />
      {comments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} />
      ))}
    </div>
  )
}
```

The input now clears on submit and a faded comment card appears at the top of the list. When the server confirms, the faded card disappears and the real comment takes its place in the server-rendered list.

### Step 5: Move cards between columns

The board has three columns: Todo, In Progress, and Done. Each column renders tasks from the server-provided `tasks` prop.

Dropping a card starts a Server Function that writes the new status. The `tasks` prop doesn't change until the next server render arrives, so the client needs a temporary task list for the pending move.

Here the Server Function is called on drop:

```tsx filename="features/task/components/board.tsx"
'use client'

import { use } from 'react'
import { updateStatus } from '@/features/task/task-actions'

export function Board({ tasksPromise }) {
  const tasks = use(tasksPromise)

  function handleDrop(targetStatus, taskId) {
    updateStatus(taskId, targetStatus)
  }

  // ...render columns from tasks
}
```

The component receives a promise from the parent server component (see Step 1's `<Suspense>` boundary) and unwraps it with [`use`](https://react.dev/reference/react/use). With this version, a card dragged from "Todo" to "In Progress" stays in the old column while the server processes the update, then jumps to the new column after the response arrives.

Add `useOptimistic` with a reducer to remap the card's status on the current frame. The reducer receives the full task list and an action describing which card moved where:

```tsx filename="features/task/components/board.tsx"
'use client'

import { startTransition, use, useOptimistic } from 'react'
import { updateStatus } from '@/features/task/task-actions'

export function Board({ tasksPromise }) {
  const tasks = use(tasksPromise)
  const [optimisticTasks, moveTask] = useOptimistic(
    tasks,
    (currentTasks, action: { taskId: string; status: Status }) =>
      currentTasks.map((t) =>
        t.id === action.taskId ? { ...t, status: action.status } : t
      )
  )

  function handleDrop(targetStatus, taskId) {
    startTransition(async () => {
      moveTask({ taskId, status: targetStatus })
      await updateStatus(taskId, targetStatus)
    })
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {columns.map((col) => (
        <Column
          key={col.status}
          tasks={optimisticTasks.filter((t) => t.status === col.status)}
          onDrop={(taskId) => handleDrop(col.status, taskId)}
        />
      ))}
    </div>
  )
}
```

The reducer maps over the task list and updates the status of the dragged card, leaving the rest unchanged. If a background refresh arrives mid-drag, for example from polling or another user's mutation, React re-runs the reducer with the updated base data so the optimistic move sits on top of fresh data.

This step uses the standalone `startTransition` instead of `useTransition` because the hook's `isPending` would trigger the board fade from Step 3. The optimistic move already covers the visual feedback, so no pending indicator is needed. If the Server Function fails, the card reverts.

A card dragged from "Todo" to "In Progress" now lands in the target column the moment you release.

### Step 6: Manage form lifecycle

The board has a "New Task" button that opens a create dialog. The form action creates the task on the server, then refreshes the board.

The dialog coordinates three pieces of client state while the action is pending: the submit button, the field values, and whether the dialog is open. [`useActionState`](https://react.dev/reference/react/useActionState) handles all three.

Here a form manages submission state manually and calls the Server Function in an `onSubmit` handler:

```tsx filename="features/task/components/create-task-modal.tsx"
'use client'

import { useState } from 'react'
import { createTask } from '@/features/task/task-actions'

export function CreateTaskModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const title = formData.get('title')
    if (!title.trim()) return

    setIsSubmitting(true)
    await createTask({ title /* ... */ })
    setIsSubmitting(false)
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <form onSubmit={handleSubmit}>
        <input name="title" placeholder="Task title..." required />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Task'}
        </button>
      </form>
    </Dialog>
  )
}
```

With this version, the submit handler runs, but two separate `useState` calls manage the pending state. The dialog closes before the board shows the new task, because `setIsOpen(false)` fires outside of a transition. The form fields also keep their values across submissions unless you track a reset key yourself.

`useActionState` handles all three concerns: `isPending` for the button, key-based reset for the fields, and a wrap around the dialog close:

```tsx filename="features/task/components/create-task-modal.tsx"
'use client'

import { useActionState, startTransition, useState } from 'react'
import { createTask } from '@/features/task/task-actions'

export function CreateTaskModal() {
  const [isOpen, setIsOpen] = useState(false)

  const [{ key }, formAction, isPending] = useActionState(
    async (prev, formData) => {
      const title = String(formData.get('title'))
      if (!title.trim()) return prev

      await createTask({
        title,
        description: String(formData.get('description')),
        status: 'todo',
        priority: 'medium',
      })

      startTransition(() => setIsOpen(false))
      return { key: prev.key + 1 }
    },
    { key: 0 }
  )

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <form action={formAction}>
        <div key={key}>
          <input name="title" placeholder="Task title..." required />
          <input name="description" placeholder="Describe the task..." />
        </div>
        <button type="submit" disabled={isPending}>
          {isPending ? 'Creating...' : 'Create Task'}
        </button>
      </form>
    </Dialog>
  )
}
```

The `key` in the returned state controls form reset. On success, `key` increments, which remounts the `<div key={key}>` and resets every input inside it.

`useActionState` runs the action as a transition, so the dialog stays open and `isPending` stays `true` while `createTask` runs. State updates after the `await` aren't automatically part of that transition, so wrapping `setIsOpen(false)` in `startTransition` runs the close as part of the transition.

With that wrap in place, React batches the dialog close with the board update that `refresh()` triggers inside `createTask`, so the new task appears at the moment the dialog closes. Without it, the dialog closes first and the board updates a frame later.

> **Good to know:** This limitation is documented in React under [React doesn't treat my state update after `await` as a transition](https://react.dev/reference/react/useTransition#react-doesnt-treat-my-state-update-after-await-as-a-transition). Until it's fixed, wrapping post-`await` state updates in `startTransition` is the recommended workaround.

The same post-`await` window is where side effects like toasts belong:

```tsx
await createTask({
  /* … */
})

startTransition(() => setIsOpen(false))
toast.success('Task created')
```

Side effects that don't affect rendered state, such as analytics, toasts, and focus changes, run after the `await` resolves. They don't need a transition because they don't update React state.

The button text now changes to "Creating..." and dims on submit. When the server responds, the fields clear, the dialog closes, the new task appears on the board, and a toast confirms the action.

> **Good to know:** The companion app adds status, priority, assignee, and label pickers to the modal. The pattern is the same: hidden inputs track each picker's state, and `key` resets them all on success.

### Step 7: Signal pending deletion to a parent

Each comment card has a delete button that removes the comment on the server, and the comment disappears from the list after the next render.

Between the click and that render, the card still shows the old data. The list itself can't show the pending removal, so the signal has to come from the button.

This step reuses the `data-pending` CSS hook from Step 3, but drives it from `useOptimistic(false)` instead of the `isPending` from `useTransition`.

Here the Server Function is called directly:

```tsx filename="features/task/components/delete-button.tsx"
'use client'

import { Trash2 } from 'lucide-react'
import { deleteComment } from '@/features/task/task-actions'

export function DeleteButton({ commentId }) {
  return (
    <button
      onClick={() => deleteComment(commentId)}
      aria-label="Delete comment"
    >
      <Trash2 className="size-3" />
    </button>
  )
}
```

With this version, the comment stays fully visible until the next server render.

Wrap the action in a `<form>`, track pending state with `useOptimistic(false)`, and expose it through a `data-pending` attribute. Accept the action as a `deleteAction` prop so the parent comment card can react with CSS:

```tsx filename="features/task/components/delete-button.tsx"
'use client'

import { useOptimistic } from 'react'
import { Trash2 } from 'lucide-react'

export function DeleteButton({
  deleteAction,
}: {
  deleteAction: () => void | Promise<void>
}) {
  const [isPending, setIsPending] = useOptimistic(false)

  return (
    <form
      action={async () => {
        setIsPending(true)
        await deleteAction()
      }}
    >
      <button
        type="submit"
        disabled={isPending}
        data-pending={isPending ? '' : undefined}
        aria-label="Delete comment"
      >
        <Trash2 className="size-3" />
      </button>
    </form>
  )
}
```

The parent comment card uses Tailwind's `has-data-pending:` variant to fade itself when any descendant sets the `data-pending` attribute. The button is the only component that knows when deletion is pending, so exposing that state as a CSS attribute lets any ancestor dim itself without lifting state or threading callbacks:

```tsx filename="features/task/components/comment-card.tsx"
<div className="rounded-lg px-3 transition-all has-data-pending:opacity-30">
  {/* comment content */}
  {deleteAction && <DeleteButton deleteAction={deleteAction} />}
</div>
```

The parent server component binds the Server Function to the comment ID, which keeps `DeleteButton` reusable:

```tsx filename="features/task/components/comment-section.tsx"
<CommentCard
  comment={comment}
  deleteAction={
    comment.userName === 'You'
      ? deleteComment.bind(null, comment.id)
      : undefined
  }
/>
```

The card now fades to 30% opacity the moment the click registers. When the server confirms and the next render arrives, the card unmounts from the list.

### Step 8: Make repeat navigation instant

Every pattern so far smooths a single interaction. Across navigations, the same reads rerun and the same fallbacks paint again. [Caching](/docs/app/getting-started/caching) the reusable reads and [prefetching](/docs/app/guides/prefetching) them with the real request closes that gap without moving the data model into the browser.

This step uses [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents), introduced in Next.js 16. Steps 1 through 7 work without it. If you aren't using Cache Components, see [Caching without Cache Components](/docs/app/guides/caching-without-cache-components).

Enable it in `next.config.ts`:

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

Enabling Cache Components applies prerender validation across every route, not just the ones in this step. A route that reads request data such as `cookies()`, `headers()`, or `searchParams` outside [`<Suspense>`](https://react.dev/reference/react/Suspense) now blocks prerendering and needs the Step 1 treatment. To turn it on in an existing app, see [Migrating to Cache Components](/docs/app/guides/migrating-to-cache-components).

#### Cache reusable reads

For each server read, ask whether the next viewer would see the same thing. Tasks and comments would, so mark each one with [`'use cache'`](/docs/app/api-reference/directives/use-cache) and tag it for invalidation:

```ts filename="features/task/task-queries.ts"
import { cache } from 'react'
import { cacheTag } from 'next/cache'
import { getTaskById } from '@/lib/db'

export const getTask = cache(async (id: string) => {
  'use cache'
  cacheTag('tasks', `task-${id}`)

  return getTaskById(id)
})
```

The per-id tag `task-${id}` gives a single task its own handle. The broader `tasks` tag covers the list. See the [Caching guide](/docs/app/getting-started/caching) for cache scoping (`'use cache: private'`, `'use cache: remote'`) and tag patterns.

#### Invalidate from mutations

[`refresh()`](/docs/app/api-reference/functions/refresh) reruns dynamic work but leaves cached entries in place. Replace it with [`updateTag`](/docs/app/api-reference/functions/updateTag) for the tags each write touched:

```ts filename="features/task/task-actions.ts"
'use server'

import { updateTag } from 'next/cache'

export async function updateStatus(taskId: string, newStatus: Status) {
  // …mutate
  updateTag('tasks')
  updateTag(`task-${taskId}`)
}
```

Every Server Function follows the same shape: run the write, then call `updateTag` for the cached reads that changed. See the [Revalidating guide](/docs/app/getting-started/revalidating) for tag patterns, time-based revalidation, and on-demand invalidation from route handlers.

#### Prefetch the destination with the real request

> **Good to know:** Partial Prefetching ships in Next.js 16.3 and later with [`partialPrefetching: true`](/docs/app/api-reference/config/next-config-js/partialPrefetching) set in `next.config.ts`. See the [Adopting Partial Prefetching guide](/docs/app/guides/adopting-partial-prefetching) for the migration path, plus the [Runtime Prefetching](/docs/app/guides/runtime-prefetching) and [Instant Navigation](/docs/app/guides/instant-navigation) guides for the full picture.

Under [Partial Prefetching](/docs/app/guides/adopting-partial-prefetching), [`<Link>`](/docs/app/api-reference/components/link) prefetches the destination's [App Shell](/docs/app/glossary#app-shell) by default. Setting `prefetch={true}` extends the prefetch to include the destination's cached content.

If the destination's cached reads depend on request data (cookies, headers, `searchParams`, or `params` not resolved by [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params)), opt the route into [runtime prefetching](/docs/app/guides/runtime-prefetching) with the [`prefetch`](/docs/app/api-reference/file-conventions/route-segment-config/prefetch) segment export so those reads resolve at prefetch time:

```tsx filename="app/task/[id]/page.tsx"
export const prefetch = 'allow-runtime'

export default function TaskPage({ params }) {
  // …
}
```

```tsx filename="features/task/components/task-card.tsx"
<Link href={`/task/${id}`} prefetch={true}>
  {/* … */}
</Link>
```

A prefetch only pays off when the destination's reads are cached: the tags from the previous subsections give the prefetched output a stable slot in the [Client Cache](/docs/app/glossary#client-cache), so a later navigation reuses it instead of refetching. In the companion app, each task card is a [`<Link>`](/docs/app/api-reference/components/link) to the task detail page. The same element is also `draggable`, and the browser distinguishes a click from a drag natively. Because the cards are links, the detail page prefetches as they scroll into view, so the destination paints instantly by the time the user clicks. See the [Prefetching guide](/docs/app/guides/prefetching) and [Runtime Prefetching guide](/docs/app/guides/runtime-prefetching) for prefetch modes, and the [Instant Navigation guide](/docs/app/guides/instant-navigation) for validating that navigations stay instant in production.

## Next steps

The patterns in this guide combine a handful of primitives:

| Situation                                                                 | Use                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slow data should stream in without blocking the page                      | [`<Suspense>`](https://react.dev/reference/react/Suspense)                                                                                                                                                                                                                   |
| A value should update while async work runs                               | [`useOptimistic`](https://react.dev/reference/react/useOptimistic)                                                                                                                                                                                                           |
| Async work needs pending state, error handling, or coordinated UI updates | [`useTransition`](https://react.dev/reference/react/useTransition)                                                                                                                                                                                                           |
| A form needs pending, reset, and result state                             | [`useActionState`](https://react.dev/reference/react/useActionState)                                                                                                                                                                                                         |
| An ancestor should show pending state for work happening elsewhere        | [`data-pending`](https://react.dev/reference/react-dom/components/form#props) attribute styled with CSS                                                                                                                                                                      |
| Reusable reads should survive across requests and stay fresh after writes | [`'use cache'`](/docs/app/api-reference/directives/use-cache) with [`cacheTag`](/docs/app/api-reference/functions/cacheTag), revalidated by [`updateTag`](/docs/app/api-reference/functions/updateTag) or [`revalidateTag`](/docs/app/api-reference/functions/revalidateTag) |
| Navigation between pages of an interactive app should feel instant        | [`<Link>`](/docs/app/api-reference/components/link) prefetching with [Partial Prefetching](/docs/app/guides/adopting-partial-prefetching), and [Runtime prefetching](/docs/app/guides/runtime-prefetching) for request-dependent reads                                       |

Most patterns mix two or more of these. Reach for whichever primitive fits the constraint you're solving.

Related guides:

- [Streaming](/docs/app/guides/streaming) for loading boundaries and `<Suspense>` patterns
- [Instant Navigation](/docs/app/guides/instant-navigation) for validating that navigations stay instant
- [View Transitions](/docs/app/guides/view-transitions) for animating state changes
