---
title: useSyncExternalStore
---

<Intro>

`useSyncExternalStore` is a React Hook that lets you subscribe to an external store.

```js
const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)` {/_usesyncexternalstore_/}

Call `useSyncExternalStore` at the top level of your component to read a value from an external data store.

```js
import { useSyncExternalStore } from 'react'
import { todosStore } from './todoStore.js'

function TodosApp() {
  const todos = useSyncExternalStore(
    todosStore.subscribe,
    todosStore.getSnapshot
  )
  // ...
}
```

It returns the snapshot of the data in the store. You need to pass two functions as arguments:

1. The `subscribe` function should subscribe to the store and return a function that unsubscribes.
2. The `getSnapshot` function should read a snapshot of the data from the store.

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `subscribe`: A function that takes a single `callback` argument and subscribes it to the store. When the store changes, it should invoke the provided `callback`, which will cause React to re-call `getSnapshot` and (if needed) re-render the component. The `subscribe` function should return a function that cleans up the subscription.

- `getSnapshot`: A function that returns a snapshot of the data in the store that's needed by the component. While the store has not changed, repeated calls to `getSnapshot` must return the same value. If the store changes and the returned value is different (as compared by [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is)), React re-renders the component.

- **optional** `getServerSnapshot`: A function that returns the initial snapshot of the data in the store. It will be used only during server rendering and during hydration of server-rendered content on the client. The server snapshot must be the same between the client and the server, and is usually serialized and passed from the server to the client. If you omit this argument, rendering the component on the server will throw an error.

#### Returns {/_returns_/}

The current snapshot of the store which you can use in your rendering logic.

#### Caveats {/_caveats_/}

- The store snapshot returned by `getSnapshot` must be immutable. If the underlying store has mutable data, return a new immutable snapshot if the data has changed. Otherwise, return a cached last snapshot.

- If a different `subscribe` function is passed during a re-render, React will re-subscribe to the store using the newly passed `subscribe` function. You can prevent this by declaring `subscribe` outside the component.

- If the store is mutated during a [non-blocking Transition update](/reference/react/useTransition), React will fall back to performing that update as blocking. Specifically, for every Transition update, React will call `getSnapshot` a second time just before applying changes to the DOM. If it returns a different value than when it was called originally, React will restart the update from scratch, this time applying it as a blocking update, to ensure that every component on screen is reflecting the same version of the store.

- It's not recommended to _suspend_ a render based on a store value returned by `useSyncExternalStore`. The reason is that mutations to the external store cannot be marked as [non-blocking Transition updates](/reference/react/useTransition), so they will trigger the nearest [`Suspense` fallback](/reference/react/Suspense), replacing already-rendered content on screen with a loading spinner, which typically makes a poor UX.

  For example, the following are discouraged:

  ```js
  const LazyProductDetailPage = lazy(() => import('./ProductDetailPage.js'));

  function ShoppingApp() {
    const selectedProductId = useSyncExternalStore(...);

    // ❌ Calling `use` with a Promise dependent on `selectedProductId`
    const data = use(fetchItem(selectedProductId))

    // ❌ Conditionally rendering a lazy component based on `selectedProductId`
    return selectedProductId != null ? <LazyProductDetailPage /> : <FeaturedProducts />;
  }
  ```

---

## Usage {/_usage_/}

### Subscribing to an external store {/_subscribing-to-an-external-store_/}

Most of your React components will only read data from their [props,](/learn/passing-props-to-a-component) [state,](/reference/react/useState) and [context.](/reference/react/useContext) However, sometimes a component needs to read some data from some store outside of React that changes over time. This includes:

- Third-party state management libraries that hold state outside of React.
- Browser APIs that expose a mutable value and events to subscribe to its changes.

Call `useSyncExternalStore` at the top level of your component to read a value from an external data store.

```js [[1, 5, "todosStore.subscribe"], [2, 5, "todosStore.getSnapshot"], [3, 5, "todos", 0]]
import { useSyncExternalStore } from 'react'
import { todosStore } from './todoStore.js'

function TodosApp() {
  const todos = useSyncExternalStore(
    todosStore.subscribe,
    todosStore.getSnapshot
  )
  // ...
}
```

It returns the <CodeStep step={3}>snapshot</CodeStep> of the data in the store. You need to pass two functions as arguments:

1. The <CodeStep step={1}>`subscribe` function</CodeStep> should subscribe to the store and return a function that unsubscribes.
2. The <CodeStep step={2}>`getSnapshot` function</CodeStep> should read a snapshot of the data from the store.

React will use these functions to keep your component subscribed to the store and re-render it on changes.

For example, in the sandbox below, `todosStore` is implemented as an external store that stores data outside of React. The `TodosApp` component connects to that external store with the `useSyncExternalStore` Hook.

<Sandpack>

```js
import { useSyncExternalStore } from 'react'
import { todosStore } from './todoStore.js'

export default function TodosApp() {
  const todos = useSyncExternalStore(
    todosStore.subscribe,
    todosStore.getSnapshot
  )
  return (
    <>
      <button onClick={() => todosStore.addTodo()}>Add todo</button>
      <hr />
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
    </>
  )
}
```

```js src/todoStore.js
// This is an example of a third-party store
// that you might need to integrate with React.

// If your app is fully built with React,
// we recommend using React state instead.

let nextId = 0
let todos = [{ id: nextId++, text: 'Todo #1' }]
let listeners = []

export const todosStore = {
  addTodo() {
    todos = [...todos, { id: nextId++, text: 'Todo #' + nextId }]
    emitChange()
  },
  subscribe(listener) {
    listeners = [...listeners, listener]
    return () => {
      listeners = listeners.filter((l) => l !== listener)
    }
  },
  getSnapshot() {
    return todos
  },
}

function emitChange() {
  for (let listener of listeners) {
    listener()
  }
}
```

</Sandpack>

<Note>

When possible, we recommend using built-in React state with [`useState`](/reference/react/useState) and [`useReducer`](/reference/react/useReducer) instead. The `useSyncExternalStore` API is mostly useful if you need to integrate with existing non-React code.

</Note>

---

### Subscribing to a browser API {/_subscribing-to-a-browser-api_/}

Another reason to add `useSyncExternalStore` is when you want to subscribe to some value exposed by the browser that changes over time. For example, suppose that you want your component to display whether the network connection is active. The browser exposes this information via a property called [`navigator.onLine`.](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)

This value can change without React's knowledge, so you should read it with `useSyncExternalStore`.

```js
import { useSyncExternalStore } from 'react'

function ChatIndicator() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot)
  // ...
}
```

To implement the `getSnapshot` function, read the current value from the browser API:

```js
function getSnapshot() {
  return navigator.onLine
}
```

Next, you need to implement the `subscribe` function. For example, when `navigator.onLine` changes, the browser fires the [`online`](https://developer.mozilla.org/en-US/docs/Web/API/Window/online_event) and [`offline`](https://developer.mozilla.org/en-US/docs/Web/API/Window/offline_event) events on the `window` object. You need to subscribe the `callback` argument to the corresponding events, and then return a function that cleans up the subscriptions:

```js
function subscribe(callback) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}
```

Now React knows how to read the value from the external `navigator.onLine` API and how to subscribe to its changes. Disconnect your device from the network and notice that the component re-renders in response:

<Sandpack>

```js
import { useSyncExternalStore } from 'react'

export default function ChatIndicator() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot)
  return <h1>{isOnline ? '✅ Online' : '❌ Disconnected'}</h1>
}

function getSnapshot() {
  return navigator.onLine
}

function subscribe(callback) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}
```

</Sandpack>

---

### Extracting the logic to a custom Hook {/_extracting-the-logic-to-a-custom-hook_/}

Usually you won't write `useSyncExternalStore` directly in your components. Instead, you'll typically call it from your own custom Hook. This lets you use the same external store from different components.

For example, this custom `useOnlineStatus` Hook tracks whether the network is online:

```js {3,6}
import { useSyncExternalStore } from 'react'

export function useOnlineStatus() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot)
  return isOnline
}

function getSnapshot() {
  // ...
}

function subscribe(callback) {
  // ...
}
```

Now different components can call `useOnlineStatus` without repeating the underlying implementation:

<Sandpack>

```js
import { useOnlineStatus } from './useOnlineStatus.js'

function StatusBar() {
  const isOnline = useOnlineStatus()
  return <h1>{isOnline ? '✅ Online' : '❌ Disconnected'}</h1>
}

function SaveButton() {
  const isOnline = useOnlineStatus()

  function handleSaveClick() {
    console.log('✅ Progress saved')
  }

  return (
    <button disabled={!isOnline} onClick={handleSaveClick}>
      {isOnline ? 'Save progress' : 'Reconnecting...'}
    </button>
  )
}

export default function App() {
  return (
    <>
      <SaveButton />
      <StatusBar />
    </>
  )
}
```

```js src/useOnlineStatus.js
import { useSyncExternalStore } from 'react'

export function useOnlineStatus() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot)
  return isOnline
}

function getSnapshot() {
  return navigator.onLine
}

function subscribe(callback) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}
```

</Sandpack>

---

### Adding support for server rendering {/_adding-support-for-server-rendering_/}

If your React app uses [server rendering,](/reference/react-dom/server) your React components will also run outside the browser environment to generate the initial HTML. This creates a few challenges when connecting to an external store:

- If you're connecting to a browser-only API, it won't work because it does not exist on the server.
- If you're connecting to a third-party data store, you'll need its data to match between the server and client.

To solve these issues, pass a `getServerSnapshot` function as the third argument to `useSyncExternalStore`:

```js {4,12-14}
import { useSyncExternalStore } from 'react'

export function useOnlineStatus() {
  const isOnline = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )
  return isOnline
}

function getSnapshot() {
  return navigator.onLine
}

function getServerSnapshot() {
  return true // Always show "Online" for server-generated HTML
}

function subscribe(callback) {
  // ...
}
```

The `getServerSnapshot` function is similar to `getSnapshot`, but it runs only in two situations:

- It runs on the server when generating the HTML.
- It runs on the client during [hydration](/reference/react-dom/client/hydrateRoot), i.e. when React takes the server HTML and makes it interactive.

This lets you provide the initial snapshot value which will be used before the app becomes interactive. If there is no meaningful initial value for the server rendering, omit this argument to [force rendering on the client.](/reference/react/Suspense#providing-a-fallback-for-server-errors-and-client-only-content)

<Note>

Make sure that `getServerSnapshot` returns the same exact data on the initial client render as it returned on the server. For example, if `getServerSnapshot` returned some prepopulated store content on the server, you need to transfer this content to the client. One way to do this is to emit a `<script>` tag during server rendering that sets a global like `window.MY_STORE_DATA`, and read from that global on the client in `getServerSnapshot`. Your external store should provide instructions on how to do that.

</Note>

---

## Troubleshooting {/_troubleshooting_/}

### I'm getting an error: "The result of `getSnapshot` should be cached" {/_im-getting-an-error-the-result-of-getsnapshot-should-be-cached_/}

This error means your `getSnapshot` function returns a new object every time it's called, for example:

```js {2-5}
function getSnapshot() {
  // 🔴 Do not return always different objects from getSnapshot
  return {
    todos: myStore.todos,
  }
}
```

React will re-render the component if `getSnapshot` return value is different from the last time. This is why, if you always return a different value, you will enter an infinite loop and get this error.

Your `getSnapshot` object should only return a different object if something has actually changed. If your store contains immutable data, you can return that data directly:

```js {2-3}
function getSnapshot() {
  // ✅ You can return immutable data
  return myStore.todos
}
```

If your store data is mutable, your `getSnapshot` function should return an immutable snapshot of it. This means it _does_ need to create new objects, but it shouldn't do this for every single call. Instead, it should store the last calculated snapshot, and return the same snapshot as the last time if the data in the store has not changed. How you determine whether mutable data has changed depends on your mutable store.

---

### My `subscribe` function gets called after every re-render {/_my-subscribe-function-gets-called-after-every-re-render_/}

This `subscribe` function is defined _inside_ a component so it is different on every re-render:

```js {2-5}
function ChatIndicator() {
  // 🚩 Always a different function, so React will resubscribe on every re-render
  function subscribe() {
    // ...
  }

  const isOnline = useSyncExternalStore(subscribe, getSnapshot)

  // ...
}
```

React will resubscribe to your store if you pass a different `subscribe` function between re-renders. If this causes performance issues and you'd like to avoid resubscribing, move the `subscribe` function outside:

```js {1-4}
// ✅ Always the same function, so React won't need to resubscribe
function subscribe() {
  // ...
}

function ChatIndicator() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot)
  // ...
}
```

Alternatively, wrap `subscribe` into [`useCallback`](/reference/react/useCallback) to only resubscribe when some argument changes:

```js {2-5}
function ChatIndicator({ userId }) {
  // ✅ Same function as long as userId doesn't change
  const subscribe = useCallback(() => {
    // ...
  }, [userId])

  const isOnline = useSyncExternalStore(subscribe, getSnapshot)

  // ...
}
```
