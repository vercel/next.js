---
title: startTransition
---

<Intro>

`startTransition` lets you render a part of the UI in the background.

```js
startTransition(action)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `startTransition(action)` {/_starttransition_/}

The `startTransition` function lets you mark a state update as a Transition.

```js {7,9}
import { startTransition } from 'react'

function TabContainer() {
  const [tab, setTab] = useState('about')

  function selectTab(nextTab) {
    startTransition(() => {
      setTab(nextTab)
    })
  }
  // ...
}
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `action`: A function that updates some state by calling one or more [`set` functions](/reference/react/useState#setstate). React calls `action` immediately with no parameters and marks all state updates scheduled synchronously during the `action` function call as Transitions. Any async calls awaited in the `action` will be included in the transition, but currently require wrapping any `set` functions after the `await` in an additional `startTransition` (see [Troubleshooting](/reference/react/useTransition#react-doesnt-treat-my-state-update-after-await-as-a-transition)). State updates marked as Transitions will be [non-blocking](#marking-a-state-update-as-a-non-blocking-transition) and [will not display unwanted loading indicators.](/reference/react/useTransition#preventing-unwanted-loading-indicators).

#### Returns {/_returns_/}

`startTransition` does not return anything.

#### Caveats {/_caveats_/}

- `startTransition` does not provide a way to track whether a Transition is pending. To show a pending indicator while the Transition is ongoing, you need [`useTransition`](/reference/react/useTransition) instead.

- You can wrap an update into a Transition only if you have access to the `set` function of that state. If you want to start a Transition in response to some prop or a custom Hook return value, try [`useDeferredValue`](/reference/react/useDeferredValue) instead.

- The function you pass to `startTransition` is called immediately, marking all state updates that happen while it executes as Transitions. If you try to perform state updates in a `setTimeout`, for example, they won't be marked as Transitions.

- You must wrap any state updates after any async requests in another `startTransition` to mark them as Transitions. This is a known limitation that we will fix in the future (see [Troubleshooting](/reference/react/useTransition#react-doesnt-treat-my-state-update-after-await-as-a-transition)).

- A state update marked as a Transition will be interrupted by other state updates. For example, if you update a chart component inside a Transition, but then start typing into an input while the chart is in the middle of a re-render, React will restart the rendering work on the chart component after handling the input state update.

- Transition updates can't be used to control text inputs.

- If there are multiple ongoing Transitions, React currently batches them together. This is a limitation that may be removed in a future release.

---

## Usage {/_usage_/}

### Marking a state update as a non-blocking Transition {/_marking-a-state-update-as-a-non-blocking-transition_/}

You can mark a state update as a _Transition_ by wrapping it in a `startTransition` call:

```js {7,9}
import { startTransition } from 'react'

function TabContainer() {
  const [tab, setTab] = useState('about')

  function selectTab(nextTab) {
    startTransition(() => {
      setTab(nextTab)
    })
  }
  // ...
}
```

Transitions let you keep the user interface updates responsive even on slow devices.

With a Transition, your UI stays responsive in the middle of a re-render. For example, if the user clicks a tab but then change their mind and click another tab, they can do that without waiting for the first re-render to finish.

<Note>

`startTransition` is very similar to [`useTransition`](/reference/react/useTransition), except that it does not provide the `isPending` flag to track whether a Transition is ongoing. You can call `startTransition` when `useTransition` is not available. For example, `startTransition` works outside components, such as from a data library.

[Learn about Transitions and see examples on the `useTransition` page.](/reference/react/useTransition)

</Note>
