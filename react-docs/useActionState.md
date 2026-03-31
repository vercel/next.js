---
title: useActionState
---

<Intro>

`useActionState` is a React Hook that lets you update state with side effects using [Actions](/reference/react/useTransition#functions-called-in-starttransition-are-called-actions).

```js
const [state, dispatchAction, isPending] = useActionState(reducerAction, initialState, permalink?);
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useActionState(reducerAction, initialState, permalink?)` {/_useactionstate_/}

Call `useActionState` at the top level of your component to create state for the result of an Action.

```js
import { useActionState } from 'react'

function reducerAction(previousState, actionPayload) {
  // ...
}

function MyCart({ initialState }) {
  const [state, dispatchAction, isPending] = useActionState(
    reducerAction,
    initialState
  )
  // ...
}
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `reducerAction`: The function to be called when the Action is triggered. When called, it receives the previous state (initially the `initialState` you provided, then its previous return value) as its first argument, followed by the `actionPayload` passed to `dispatchAction`.
- `initialState`: The value you want the state to be initially. React ignores this argument after `dispatchAction` is invoked for the first time.
- **optional** `permalink`: A string containing the unique page URL that this form modifies.
  - For use on pages with [React Server Components](/reference/rsc/server-components) with progressive enhancement.
  - If `reducerAction` is a [Server Function](/reference/rsc/server-functions) and the form is submitted before the JavaScript bundle loads, the browser will navigate to the specified permalink URL rather than the current page's URL.

#### Returns {/_returns_/}

`useActionState` returns an array with exactly three values:

1. The current state. During the first render, it will match the `initialState` you passed. After `dispatchAction` is invoked, it will match the value returned by the `reducerAction`.
2. A `dispatchAction` function that you call inside [Actions](/reference/react/useTransition#functions-called-in-starttransition-are-called-actions).
3. The `isPending` flag that tells you if any dispatched Actions for this Hook are pending.

#### Caveats {/_caveats_/}

- `useActionState` is a Hook, so you can only call it **at the top level of your component** or your own Hooks. You can't call it inside loops or conditions. If you need that, extract a new component and move the state into it.
- React queues and executes multiple calls to `dispatchAction` sequentially. Each call to `reducerAction` receives the result of the previous call.
- The `dispatchAction` function has a stable identity, so you will often see it omitted from Effect dependencies, but including it will not cause the Effect to fire. If the linter lets you omit a dependency without errors, it is safe to do. [Learn more about removing Effect dependencies.](/learn/removing-effect-dependencies#move-dynamic-objects-and-functions-inside-your-effect)
- When using the `permalink` option, ensure the same form component is rendered on the destination page (including the same `reducerAction` and `permalink`) so React knows how to pass the state through. Once the page becomes interactive, this parameter has no effect.
- When using Server Functions, `initialState` needs to be [serializable](/reference/rsc/use-server#serializable-parameters-and-return-values) (values like plain objects, arrays, strings, and numbers).
- If `dispatchAction` throws an error, React cancels all queued actions and shows the nearest [Error Boundary](/reference/react/Component#catching-rendering-errors-with-an-error-boundary).
- If there are multiple ongoing Actions, React batches them together. This is a limitation that may be removed in a future release.

<Note>

`dispatchAction` must be called from an Action.

You can wrap it in [`startTransition`](/reference/react/startTransition), or pass it to an [Action prop](/reference/react/useTransition#exposing-action-props-from-components). Calls outside that scope won’t be treated as part of the Transition and [log an error](#async-function-outside-transition) on development mode.

</Note>

---

### `reducerAction` function {/_reduceraction_/}

The `reducerAction` function passed to `useActionState` receives the previous state and returns a new state.

Unlike reducers in `useReducer`, the `reducerAction` can be async and perform side effects:

```js
async function reducerAction(previousState, actionPayload) {
  const newState = await post(actionPayload)
  return newState
}
```

Each time you call `dispatchAction`, React calls the `reducerAction` with the `actionPayload`. The reducer will perform side effects such as posting data, and return the new state. If `dispatchAction` is called multiple times, React queues and executes them in order so the result of the previous call is passed as `previousState` for the current call.

#### Parameters {/_reduceraction-parameters_/}

- `previousState`: The last state. Initially this is equal to the `initialState`. After the first call to `dispatchAction`, it's equal to the last state returned.

- **optional** `actionPayload`: The argument passed to `dispatchAction`. It can be a value of any type. Similar to `useReducer` conventions, it is usually an object with a `type` property identifying it and, optionally, other properties with additional information.

#### Returns {/_reduceraction-returns_/}

`reducerAction` returns the new state, and triggers a Transition to re-render with that state.

#### Caveats {/_reduceraction-caveats_/}

- `reducerAction` can be sync or async. It can perform sync actions like showing a notification, or async actions like posting updates to a server.
- `reducerAction` is not invoked twice in `<StrictMode>` since `reducerAction` is designed to allow side effects.
- The return type of `reducerAction` must match the type of `initialState`. If TypeScript infers a mismatch, you may need to explicitly annotate your state type.
- If you set state after `await` in the `reducerAction` you currently need to wrap the state update in an additional `startTransition`. See the [startTransition](/reference/react/useTransition#react-doesnt-treat-my-state-update-after-await-as-a-transition) docs for more info.
- When using Server Functions, `actionPayload` needs to be [serializable](/reference/rsc/use-server#serializable-parameters-and-return-values) (values like plain objects, arrays, strings, and numbers).

<DeepDive>

#### Why is it called `reducerAction`? {/_why-is-it-called-reduceraction_/}

The function passed to `useActionState` is called a _reducer action_ because:

- It _reduces_ the previous state into a new state, like `useReducer`.
- It's an _Action_ because it's called inside a Transition and can perform side effects.

Conceptually, `useActionState` is like `useReducer`, but you can do side effects in the reducer.

</DeepDive>

---

## Usage {/_usage_/}

### Adding state to an Action {/_adding-state-to-an-action_/}

Call `useActionState` at the top level of your component to create state for the result of an Action.

```js [[1, 7, "count"], [2, 7, "dispatchAction"], [3, 7, "isPending"]]
import { useActionState } from 'react'

async function addToCartAction(prevCount) {
  // ...
}
function Counter() {
  const [count, dispatchAction, isPending] = useActionState(addToCartAction, 0)

  // ...
}
```

`useActionState` returns an array with exactly three items:

1. The <CodeStep step={1}>current state</CodeStep>, initially set to the initial state you provided.
2. The <CodeStep step={2}>action dispatcher</CodeStep> that lets you trigger `reducerAction`.
3. A <CodeStep step={3}>pending state</CodeStep> that tells you whether the Action is in progress.

To call `addToCartAction`, call the <CodeStep step={2}>action dispatcher</CodeStep>. React will queue calls to `addToCartAction` with the previous count.

<Sandpack>

```js src/App.js
import { useActionState, startTransition } from 'react'
import { addToCart } from './api'
import Total from './Total'

export default function Checkout() {
  const [count, dispatchAction, isPending] = useActionState(
    async (prevCount) => {
      return await addToCart(prevCount)
    },
    0
  )

  function handleClick() {
    startTransition(() => {
      dispatchAction()
    })
  }

  return (
    <div className="checkout">
      <h2>Checkout</h2>
      <div className="row">
        <span>Eras Tour Tickets</span>
        <span>Qty: {count}</span>
      </div>
      <div className="row">
        <button onClick={handleClick}>
          Add Ticket{isPending ? ' 🌀' : '  '}
        </button>
      </div>
      <hr />
      <Total quantity={count} />
    </div>
  )
}
```

```js src/Total.js
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
})

export default function Total({ quantity }) {
  return (
    <div className="row total">
      <span>Total</span>
      <span>{formatter.format(quantity * 9999)}</span>
    </div>
  )
}
```

```js src/api.js
export async function addToCart(count) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return count + 1
}

export async function removeFromCart(count) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return Math.max(0, count - 1)
}
```

```css
.checkout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-family: system-ui;
}

.checkout h2 {
  margin: 0 0 8px 0;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.row button {
  margin-left: auto;
  min-width: 150px;
}

.total {
  font-weight: bold;
}

hr {
  width: 100%;
  border: none;
  border-top: 1px solid #ccc;
  margin: 4px 0;
}

button {
  padding: 8px 16px;
  cursor: pointer;
}
```

</Sandpack>

Every time you click "Add Ticket," React queues a call to `addToCartAction`. React shows the pending state until all the tickets are added, and then re-renders with the final state.

<DeepDive>

#### How `useActionState` queuing works {/_how-useactionstate-queuing-works_/}

Try clicking "Add Ticket" multiple times. Every time you click, a new `addToCartAction` is queued. Since there's an artificial 1 second delay, that means 4 clicks will take ~4 seconds to complete.

**This is intentional in the design of `useActionState`.**

We have to wait for the previous result of `addToCartAction` in order to pass the `prevCount` to the next call to `addToCartAction`. That means React has to wait for the previous Action to finish before calling the next Action.

You can typically solve this by [using with useOptimistic](/reference/react/useActionState#using-with-useoptimistic) but for more complex cases you may want to consider [cancelling queued actions](#cancelling-queued-actions) or not using `useActionState`.

</DeepDive>

---

### Using multiple Action types {/_using-multiple-action-types_/}

To handle multiple types, you can pass an argument to `dispatchAction`.

By convention, it is common to write it as a switch statement. For each case in the switch, calculate and return some next state. The argument can have any shape, but it is common to pass objects with a `type` property identifying the action.

<Sandpack>

```js src/App.js
import { useActionState, startTransition } from 'react'
import { addToCart, removeFromCart } from './api'
import Total from './Total'

export default function Checkout() {
  const [count, dispatchAction, isPending] = useActionState(updateCartAction, 0)

  function handleAdd() {
    startTransition(() => {
      dispatchAction({ type: 'ADD' })
    })
  }

  function handleRemove() {
    startTransition(() => {
      dispatchAction({ type: 'REMOVE' })
    })
  }

  return (
    <div className="checkout">
      <h2>Checkout</h2>
      <div className="row">
        <span>Eras Tour Tickets</span>
        <span className="stepper">
          <span className="qty">{isPending ? '🌀' : count}</span>
          <span className="buttons">
            <button onClick={handleAdd}>▲</button>
            <button onClick={handleRemove}>▼</button>
          </span>
        </span>
      </div>
      <hr />
      <Total quantity={count} isPending={isPending} />
    </div>
  )
}

async function updateCartAction(prevCount, actionPayload) {
  switch (actionPayload.type) {
    case 'ADD': {
      return await addToCart(prevCount)
    }
    case 'REMOVE': {
      return await removeFromCart(prevCount)
    }
  }
  return prevCount
}
```

```js src/Total.js
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
})

export default function Total({ quantity, isPending }) {
  return (
    <div className="row total">
      <span>Total</span>
      {isPending ? '🌀 Updating...' : formatter.format(quantity * 9999)}
    </div>
  )
}
```

```js src/api.js hidden
export async function addToCart(count) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return count + 1
}

export async function removeFromCart(count) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return Math.max(0, count - 1)
}
```

```css
.checkout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-family: system-ui;
}

.checkout h2 {
  margin: 0 0 8px 0;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty {
  min-width: 20px;
  text-align: center;
}

.buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.buttons button {
  padding: 0 8px;
  font-size: 10px;
  line-height: 1.2;
  cursor: pointer;
}

.pending {
  width: 20px;
  text-align: center;
}

.total {
  font-weight: bold;
}

hr {
  width: 100%;
  border: none;
  border-top: 1px solid #ccc;
  margin: 4px 0;
}
```

</Sandpack>

When you click to increase or decrease the quantity, an `"ADD"` or `"REMOVE"` is dispatched. In the `reducerAction`, different APIs are called to update the quantity.

In this example, we use the pending state of the Actions to replace both the quantity and the total. If you want to provide immediate feedback, such as immediately updating the quantity, you can use `useOptimistic`.

<DeepDive>

#### How is `useActionState` different from `useReducer`? {/_useactionstate-vs-usereducer_/}

You might notice this example looks a lot like `useReducer`, but they serve different purposes:

- **Use `useReducer`** to manage state of your UI. The reducer must be pure.

- **Use `useActionState`** to manage state of your Actions. The reducer can perform side effects.

You can think of `useActionState` as `useReducer` for side effects from user Actions. Since it computes the next Action to take based on the previous Action, it has to [order the calls sequentially](/reference/react/useActionState#how-useactionstate-queuing-works). If you want to perform Actions in parallel, use `useState` and `useTransition` directly.

</DeepDive>

---

### Using with `useOptimistic` {/_using-with-useoptimistic_/}

You can combine `useActionState` with [`useOptimistic`](/reference/react/useOptimistic) to show immediate UI feedback:

<Sandpack>

```js src/App.js
import { useActionState, startTransition, useOptimistic } from 'react'
import { addToCart, removeFromCart } from './api'
import Total from './Total'

export default function Checkout() {
  const [count, dispatchAction, isPending] = useActionState(updateCartAction, 0)
  const [optimisticCount, setOptimisticCount] = useOptimistic(count)

  function handleAdd() {
    startTransition(() => {
      setOptimisticCount((c) => c + 1)
      dispatchAction({ type: 'ADD' })
    })
  }

  function handleRemove() {
    startTransition(() => {
      setOptimisticCount((c) => c - 1)
      dispatchAction({ type: 'REMOVE' })
    })
  }

  return (
    <div className="checkout">
      <h2>Checkout</h2>
      <div className="row">
        <span>Eras Tour Tickets</span>
        <span className="stepper">
          <span className="pending">{isPending && '🌀'}</span>
          <span className="qty">{optimisticCount}</span>
          <span className="buttons">
            <button onClick={handleAdd}>▲</button>
            <button onClick={handleRemove}>▼</button>
          </span>
        </span>
      </div>
      <hr />
      <Total quantity={optimisticCount} isPending={isPending} />
    </div>
  )
}

async function updateCartAction(prevCount, actionPayload) {
  switch (actionPayload.type) {
    case 'ADD': {
      return await addToCart(prevCount)
    }
    case 'REMOVE': {
      return await removeFromCart(prevCount)
    }
  }
  return prevCount
}
```

```js src/Total.js
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
})

export default function Total({ quantity, isPending }) {
  return (
    <div className="row total">
      <span>Total</span>
      <span>
        {isPending ? '🌀 Updating...' : formatter.format(quantity * 9999)}
      </span>
    </div>
  )
}
```

```js src/api.js hidden
export async function addToCart(count) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return count + 1
}

export async function removeFromCart(count) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return Math.max(0, count - 1)
}
```

```css
.checkout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-family: system-ui;
}

.checkout h2 {
  margin: 0 0 8px 0;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty {
  min-width: 20px;
  text-align: center;
}

.buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.buttons button {
  padding: 0 8px;
  font-size: 10px;
  line-height: 1.2;
  cursor: pointer;
}

.pending {
  width: 20px;
  text-align: center;
}

.total {
  font-weight: bold;
}

hr {
  width: 100%;
  border: none;
  border-top: 1px solid #ccc;
  margin: 4px 0;
}
```

</Sandpack>

`setOptimisticCount` immediately updates the quantity, and `dispatchAction()` queues the `updateCartAction`. A pending indicator appears on both the quantity and total to give the user feedback that their update is still being applied.

---

### Using with Action props {/_using-with-action-props_/}

When you pass the `dispatchAction` function to a component that exposes an [Action prop](/reference/react/useTransition#exposing-action-props-from-components), you don't need to call `startTransition` or `useOptimistic` yourself.

This example shows using the `increaseAction` and `decreaseAction` props of a QuantityStepper component:

<Sandpack>

```js src/App.js
import { useActionState } from 'react'
import { addToCart, removeFromCart } from './api'
import QuantityStepper from './QuantityStepper'
import Total from './Total'

export default function Checkout() {
  const [count, dispatchAction, isPending] = useActionState(updateCartAction, 0)

  function addAction() {
    dispatchAction({ type: 'ADD' })
  }

  function removeAction() {
    dispatchAction({ type: 'REMOVE' })
  }

  return (
    <div className="checkout">
      <h2>Checkout</h2>
      <div className="row">
        <span>Eras Tour Tickets</span>
        <QuantityStepper
          value={count}
          increaseAction={addAction}
          decreaseAction={removeAction}
        />
      </div>
      <hr />
      <Total quantity={count} isPending={isPending} />
    </div>
  )
}

async function updateCartAction(prevCount, actionPayload) {
  switch (actionPayload.type) {
    case 'ADD': {
      return await addToCart(prevCount)
    }
    case 'REMOVE': {
      return await removeFromCart(prevCount)
    }
  }
  return prevCount
}
```

```js src/QuantityStepper.js
import { startTransition, useOptimistic } from 'react'

export default function QuantityStepper({
  value,
  increaseAction,
  decreaseAction,
}) {
  const [optimisticValue, setOptimisticValue] = useOptimistic(value)
  const isPending = value !== optimisticValue
  function handleIncrease() {
    startTransition(async () => {
      setOptimisticValue((c) => c + 1)
      await increaseAction()
    })
  }

  function handleDecrease() {
    startTransition(async () => {
      setOptimisticValue((c) => Math.max(0, c - 1))
      await decreaseAction()
    })
  }

  return (
    <span className="stepper">
      <span className="pending">{isPending && '🌀'}</span>
      <span className="qty">{optimisticValue}</span>
      <span className="buttons">
        <button onClick={handleIncrease}>▲</button>
        <button onClick={handleDecrease}>▼</button>
      </span>
    </span>
  )
}
```

```js src/Total.js
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
})

export default function Total({ quantity, isPending }) {
  return (
    <div className="row total">
      <span>Total</span>
      {isPending ? '🌀 Updating...' : formatter.format(quantity * 9999)}
    </div>
  )
}
```

```js src/api.js hidden
export async function addToCart(count) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return count + 1
}

export async function removeFromCart(count) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return Math.max(0, count - 1)
}
```

```css
.checkout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-family: system-ui;
}

.checkout h2 {
  margin: 0 0 8px 0;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty {
  min-width: 20px;
  text-align: center;
}

.buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.buttons button {
  padding: 0 8px;
  font-size: 10px;
  line-height: 1.2;
  cursor: pointer;
}

.pending {
  width: 20px;
  text-align: center;
}

.total {
  font-weight: bold;
}

hr {
  width: 100%;
  border: none;
  border-top: 1px solid #ccc;
  margin: 4px 0;
}
```

</Sandpack>

Since `<QuantityStepper>` has built-in support for transitions, pending state, and optimistically updating the count, you just need to tell the Action _what_ to change, and _how_ to change it is handled for you.

---

### Cancelling queued Actions {/_cancelling-queued-actions_/}

You can use an `AbortController` to cancel pending Actions:

<Sandpack>

```js src/App.js
import { useActionState, useRef } from 'react'
import { addToCart, removeFromCart } from './api'
import QuantityStepper from './QuantityStepper'
import Total from './Total'

export default function Checkout() {
  const abortRef = useRef(null)
  const [count, dispatchAction, isPending] = useActionState(updateCartAction, 0)

  async function addAction() {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = new AbortController()
    await dispatchAction({ type: 'ADD', signal: abortRef.current.signal })
  }

  async function removeAction() {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = new AbortController()
    await dispatchAction({ type: 'REMOVE', signal: abortRef.current.signal })
  }

  return (
    <div className="checkout">
      <h2>Checkout</h2>
      <div className="row">
        <span>Eras Tour Tickets</span>
        <QuantityStepper
          value={count}
          increaseAction={addAction}
          decreaseAction={removeAction}
        />
      </div>
      <hr />
      <Total quantity={count} isPending={isPending} />
    </div>
  )
}

async function updateCartAction(prevCount, actionPayload) {
  switch (actionPayload.type) {
    case 'ADD': {
      try {
        return await addToCart(prevCount, { signal: actionPayload.signal })
      } catch (e) {
        return prevCount + 1
      }
    }
    case 'REMOVE': {
      try {
        return await removeFromCart(prevCount, { signal: actionPayload.signal })
      } catch (e) {
        return Math.max(0, prevCount - 1)
      }
    }
  }
  return prevCount
}
```

```js src/QuantityStepper.js
import { startTransition, useOptimistic } from 'react'

export default function QuantityStepper({
  value,
  increaseAction,
  decreaseAction,
}) {
  const [optimisticValue, setOptimisticValue] = useOptimistic(value)
  const isPending = value !== optimisticValue
  function handleIncrease() {
    startTransition(async () => {
      setOptimisticValue((c) => c + 1)
      await increaseAction()
    })
  }

  function handleDecrease() {
    startTransition(async () => {
      setOptimisticValue((c) => Math.max(0, c - 1))
      await decreaseAction()
    })
  }

  return (
    <span className="stepper">
      <span className="pending">{isPending && '🌀'}</span>
      <span className="qty">{optimisticValue}</span>
      <span className="buttons">
        <button onClick={handleIncrease}>▲</button>
        <button onClick={handleDecrease}>▼</button>
      </span>
    </span>
  )
}
```

```js src/Total.js
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
})

export default function Total({ quantity, isPending }) {
  return (
    <div className="row total">
      <span>Total</span>
      {isPending ? '🌀 Updating...' : formatter.format(quantity * 9999)}
    </div>
  )
}
```

```js src/api.js hidden
class AbortError extends Error {
  name = 'AbortError'
  constructor(message = 'The operation was aborted') {
    super(message)
  }
}

function sleep(ms, signal) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms))
  if (signal.aborted) return Promise.reject(new AbortError())

  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(id)
      reject(new AbortError())
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}
export async function addToCart(count, opts) {
  await sleep(1000, opts?.signal)
  return count + 1
}

export async function removeFromCart(count, opts) {
  await sleep(1000, opts?.signal)
  return Math.max(0, count - 1)
}
```

```css
.checkout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-family: system-ui;
}

.checkout h2 {
  margin: 0 0 8px 0;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty {
  min-width: 20px;
  text-align: center;
}

.buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.buttons button {
  padding: 0 8px;
  font-size: 10px;
  line-height: 1.2;
  cursor: pointer;
}

.pending {
  width: 20px;
  text-align: center;
}

.total {
  font-weight: bold;
}

hr {
  width: 100%;
  border: none;
  border-top: 1px solid #ccc;
  margin: 4px 0;
}
```

</Sandpack>

Try clicking increase or decrease multiple times, and notice that the total updates within 1 second no matter how many times you click. This works because it uses an `AbortController` to "complete" the previous Action so the next Action can proceed.

<Pitfall>

Aborting an Action isn't always safe.

For example, if the Action performs a mutation (like writing to a database), aborting the network request doesn't undo the server-side change. This is why `useActionState` doesn't abort by default. It's only safe when you know the side effect can be safely ignored or retried.

</Pitfall>

---

### Using with `<form>` Action props {/_use-with-a-form_/}

You can pass the `dispatchAction` function as the `action` prop to a `<form>`.

When used this way, React automatically wraps the submission in a Transition, so you don't need to call `startTransition` yourself. The `reducerAction` receives the previous state and the submitted `FormData`:

<Sandpack>

```js src/App.js
import { useActionState, useOptimistic } from 'react'
import { addToCart, removeFromCart } from './api'
import Total from './Total'

export default function Checkout() {
  const [count, dispatchAction, isPending] = useActionState(updateCartAction, 0)
  const [optimisticCount, setOptimisticCount] = useOptimistic(count)

  async function formAction(formData) {
    const type = formData.get('type')
    if (type === 'ADD') {
      setOptimisticCount((c) => c + 1)
    } else {
      setOptimisticCount((c) => Math.max(0, c - 1))
    }
    return dispatchAction(formData)
  }

  return (
    <form action={formAction} className="checkout">
      <h2>Checkout</h2>
      <div className="row">
        <span>Eras Tour Tickets</span>
        <span className="stepper">
          <span className="pending">{isPending && '🌀'}</span>
          <span className="qty">{optimisticCount}</span>
          <span className="buttons">
            <button type="submit" name="type" value="ADD">
              ▲
            </button>
            <button type="submit" name="type" value="REMOVE">
              ▼
            </button>
          </span>
        </span>
      </div>
      <hr />
      <Total quantity={count} isPending={isPending} />
    </form>
  )
}

async function updateCartAction(prevCount, formData) {
  const type = formData.get('type')
  switch (type) {
    case 'ADD': {
      return await addToCart(prevCount)
    }
    case 'REMOVE': {
      return await removeFromCart(prevCount)
    }
  }
  return prevCount
}
```

```js src/Total.js
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
})

export default function Total({ quantity, isPending }) {
  return (
    <div className="row total">
      <span>Total</span>
      {isPending ? '🌀 Updating...' : formatter.format(quantity * 9999)}
    </div>
  )
}
```

```js src/api.js hidden
export async function addToCart(count) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return count + 1
}

export async function removeFromCart(count) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return Math.max(0, count - 1)
}
```

```css
.checkout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-family: system-ui;
}

.checkout h2 {
  margin: 0 0 8px 0;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty {
  min-width: 20px;
  text-align: center;
}

.buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.buttons button {
  padding: 0 8px;
  font-size: 10px;
  line-height: 1.2;
  cursor: pointer;
}

.pending {
  width: 20px;
  text-align: center;
}

.total {
  font-weight: bold;
}

hr {
  width: 100%;
  border: none;
  border-top: 1px solid #ccc;
  margin: 4px 0;
}
```

</Sandpack>

In this example, when the user clicks the stepper arrows, the button submits the form and `useActionState` calls `updateCartAction` with the form data. The example uses `useOptimistic` to immediately show the new quantity while the server confirms the update.

<RSC>

When used with a [Server Function](/reference/rsc/server-functions), `useActionState` allows the server's response to be shown before hydration (when React attaches to server-rendered HTML) completes. You can also use the optional `permalink` parameter for progressive enhancement (allowing the form to work before JavaScript loads) on pages with dynamic content. This is typically handled by your framework for you.

</RSC>

See the [`<form>`](/reference/react-dom/components/form#handle-form-submission-with-a-server-function) docs for more information on using Actions with forms.

---

### Handling errors {/_handling-errors_/}

There are two ways to handle errors with `useActionState`.

For known errors, such as "quantity not available" validation errors from your backend, you can return it as part of your `reducerAction` state and display it in the UI.

For unknown errors, such as `undefined is not a function`, you can throw an error. React will cancel all queued Actions and shows the nearest [Error Boundary](/reference/react/Component#catching-rendering-errors-with-an-error-boundary) by rethrowing the error from the `useActionState` hook.

<Sandpack>

```js src/App.js
import { useActionState, startTransition } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { addToCart } from './api'
import Total from './Total'

function Checkout() {
  const [state, dispatchAction, isPending] = useActionState(
    async (prevState, quantity) => {
      const result = await addToCart(prevState.count, quantity)
      if (result.error) {
        // Return the error from the API as state
        return {
          ...prevState,
          error: `Could not add quanitiy ${quantity}: ${result.error}`,
        }
      }

      if (!isPending) {
        // Clear the error state for the first dispatch.
        return { count: result.count, error: null }
      }

      // Return the new count, and any errors that happened.
      return { count: result.count, error: prevState.error }
    },
    {
      count: 0,
      error: null,
    }
  )

  function handleAdd(quantity) {
    startTransition(() => {
      dispatchAction(quantity)
    })
  }

  return (
    <div className="checkout">
      <h2>Checkout</h2>
      <div className="row">
        <span>Eras Tour Tickets</span>
        <span>
          {isPending && '🌀 '}Qty: {state.count}
        </span>
      </div>
      <div className="buttons">
        <button onClick={() => handleAdd(1)}>Add 1</button>
        <button onClick={() => handleAdd(10)}>Add 10</button>
        <button onClick={() => handleAdd(NaN)}>Add NaN</button>
      </div>
      {state.error && <div className="error">{state.error}</div>}
      <hr />
      <Total quantity={state.count} isPending={isPending} />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <div className="checkout">
          <h2>Something went wrong</h2>
          <p>The action could not be completed.</p>
          <button onClick={resetErrorBoundary}>Try again</button>
        </div>
      )}
    >
      <Checkout />
    </ErrorBoundary>
  )
}
```

```js src/Total.js
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
})

export default function Total({ quantity, isPending }) {
  return (
    <div className="row total">
      <span>Total</span>
      <span>
        {isPending ? '🌀 Updating...' : formatter.format(quantity * 9999)}
      </span>
    </div>
  )
}
```

```js src/api.js hidden
export async function addToCart(count, quantity) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (quantity > 5) {
    return { error: 'Quantity not available' }
  } else if (isNaN(quantity)) {
    throw new Error('Quantity must be a number')
  }
  return { count: count + quantity }
}
```

```css
.checkout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-family: system-ui;
}

.checkout h2 {
  margin: 0 0 8px 0;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.total {
  font-weight: bold;
}

hr {
  width: 100%;
  border: none;
  border-top: 1px solid #ccc;
  margin: 4px 0;
}

button {
  padding: 8px 16px;
  cursor: pointer;
}

.buttons {
  display: flex;
  gap: 8px;
}

.error {
  color: red;
  font-size: 14px;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "react-scripts": "^5.0.0",
    "react-error-boundary": "4.0.3"
  },
  "main": "/index.js"
}
```

</Sandpack>

In this example, "Add 10" simulates an API that returns a validation error, which `updateCartAction` stores in state and displays inline. "Add NaN" results in an invalid count, so `updateCartAction` throws, which propagates through `useActionState` to the `ErrorBoundary` and shows a reset UI.

---

## Troubleshooting {/_troubleshooting_/}

### My `isPending` flag is not updating {/_ispending-not-updating_/}

If you're calling `dispatchAction` manually (not through an Action prop), make sure you wrap the call in [`startTransition`](/reference/react/startTransition):

```js
import { useActionState, startTransition } from 'react'

function MyComponent() {
  const [state, dispatchAction, isPending] = useActionState(myAction, null)

  function handleClick() {
    // ✅ Correct: wrap in startTransition
    startTransition(() => {
      dispatchAction()
    })
  }

  // ...
}
```

When `dispatchAction` is passed to an Action prop, React automatically wraps it in a Transition.

---

### My Action cannot read form data {/_action-cannot-read-form-data_/}

When you use `useActionState`, the `reducerAction` receives an extra argument as its first argument: the previous or initial state. The submitted form data is therefore its second argument instead of its first.

```js {2,7}
// Without useActionState
function action(formData) {
  const name = formData.get('name')
}

// With useActionState
function action(prevState, formData) {
  const name = formData.get('name')
}
```

---

### My actions are being skipped {/_actions-skipped_/}

If you call `dispatchAction` multiple times and some of them don't run, it may be because an earlier `dispatchAction` call threw an error.

When a `reducerAction` throws, React skips all subsequently queued `dispatchAction` calls.

To handle this, catch errors within your `reducerAction` and return an error state instead of throwing:

```js
async function myReducerAction(prevState, data) {
  try {
    const result = await submitData(data)
    return { success: true, data: result }
  } catch (error) {
    // ✅ Return error state instead of throwing
    return { success: false, error: error.message }
  }
}
```

---

### My state doesn't reset {/_reset-state_/}

`useActionState` doesn't provide a built-in reset function. To reset the state, you can design your `reducerAction` to handle a reset signal:

```js
const initialState = { name: '', error: null }

async function formAction(prevState, payload) {
  // Handle reset
  if (payload === null) {
    return initialState
  }
  // Normal action logic
  const result = await submitData(payload)
  return result
}

function MyComponent() {
  const [state, dispatchAction, isPending] = useActionState(
    formAction,
    initialState
  )

  function handleReset() {
    startTransition(() => {
      dispatchAction(null) // Pass null to trigger reset
    })
  }

  // ...
}
```

Alternatively, you can add a `key` prop to the component using `useActionState` to force it to remount with fresh state, or a `<form>` `action` prop, which resets automatically after submission.

---

### I'm getting an error: "An async function with useActionState was called outside of a transition." {/_async-function-outside-transition_/}

A common mistake is to forget to call `dispatchAction` from inside a Transition:

<ConsoleBlockMulti>
<ConsoleLogLine level="error">

An async function with useActionState was called outside of a transition. This is likely not what you intended (for example, isPending will not update correctly). Either call the returned function inside startTransition, or pass it to an `action` or `formAction` prop.

</ConsoleLogLine>
</ConsoleBlockMulti>

This error happens because `dispatchAction` must run inside a Transition:

```js
function MyComponent() {
  const [state, dispatchAction, isPending] = useActionState(myAsyncAction, null)

  function handleClick() {
    // ❌ Wrong: calling dispatchAction outside a Transition
    dispatchAction()
  }

  // ...
}
```

To fix, either wrap the call in [`startTransition`](/reference/react/startTransition):

```js
import { useActionState, startTransition } from 'react'

function MyComponent() {
  const [state, dispatchAction, isPending] = useActionState(myAsyncAction, null)

  function handleClick() {
    // ✅ Correct: wrap in startTransition
    startTransition(() => {
      dispatchAction()
    })
  }

  // ...
}
```

Or pass `dispatchAction` to an Action prop, is call in a Transition:

```js
function MyComponent() {
  const [state, dispatchAction, isPending] = useActionState(myAsyncAction, null)

  // ✅ Correct: action prop wraps in a Transition for you
  return <Button action={dispatchAction}>...</Button>
}
```

---

### I'm getting an error: "Cannot update action state while rendering" {/_cannot-update-during-render_/}

You cannot call `dispatchAction` during render:

<ConsoleBlock level="error">

Cannot update action state while rendering.

</ConsoleBlock>

This causes an infinite loop because calling `dispatchAction` schedules a state update, which triggers a re-render, which calls `dispatchAction` again.

```js
function MyComponent() {
  const [state, dispatchAction, isPending] = useActionState(myAction, null)

  // ❌ Wrong: calling dispatchAction during render
  dispatchAction()

  // ...
}
```

To fix, only call `dispatchAction` in response to user events (like form submissions or button clicks).
