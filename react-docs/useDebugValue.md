---
title: useDebugValue
---

<Intro>

`useDebugValue` is a React Hook that lets you add a label to a custom Hook in [React DevTools.](/learn/react-developer-tools)

```js
useDebugValue(value, format?)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useDebugValue(value, format?)` {/_usedebugvalue_/}

Call `useDebugValue` at the top level of your [custom Hook](/learn/reusing-logic-with-custom-hooks) to display a readable debug value:

```js
import { useDebugValue } from 'react'

function useOnlineStatus() {
  // ...
  useDebugValue(isOnline ? 'Online' : 'Offline')
  // ...
}
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `value`: The value you want to display in React DevTools. It can have any type.
- **optional** `format`: A formatting function. When the component is inspected, React DevTools will call the formatting function with the `value` as the argument, and then display the returned formatted value (which may have any type). If you don't specify the formatting function, the original `value` itself will be displayed.

#### Returns {/_returns_/}

`useDebugValue` does not return anything.

## Usage {/_usage_/}

### Adding a label to a custom Hook {/_adding-a-label-to-a-custom-hook_/}

Call `useDebugValue` at the top level of your [custom Hook](/learn/reusing-logic-with-custom-hooks) to display a readable <CodeStep step={1}>debug value</CodeStep> for [React DevTools.](/learn/react-developer-tools)

```js [[1, 5, "isOnline ? 'Online' : 'Offline'"]]
import { useDebugValue } from 'react'

function useOnlineStatus() {
  // ...
  useDebugValue(isOnline ? 'Online' : 'Offline')
  // ...
}
```

This gives components calling `useOnlineStatus` a label like `OnlineStatus: "Online"` when you inspect them:

![A screenshot of React DevTools showing the debug value](/images/docs/react-devtools-usedebugvalue.png)

Without the `useDebugValue` call, only the underlying data (in this example, `true`) would be displayed.

<Sandpack>

```js
import { useOnlineStatus } from './useOnlineStatus.js'

function StatusBar() {
  const isOnline = useOnlineStatus()
  return <h1>{isOnline ? '✅ Online' : '❌ Disconnected'}</h1>
}

export default function App() {
  return <StatusBar />
}
```

```js src/useOnlineStatus.js active
import { useSyncExternalStore, useDebugValue } from 'react'

export function useOnlineStatus() {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  )
  useDebugValue(isOnline ? 'Online' : 'Offline')
  return isOnline
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

<Note>

Don't add debug values to every custom Hook. It's most valuable for custom Hooks that are part of shared libraries and that have a complex internal data structure that's difficult to inspect.

</Note>

---

### Deferring formatting of a debug value {/_deferring-formatting-of-a-debug-value_/}

You can also pass a formatting function as the second argument to `useDebugValue`:

```js [[1, 1, "date", 18], [2, 1, "date.toDateString()"]]
useDebugValue(date, (date) => date.toDateString())
```

Your formatting function will receive the <CodeStep step={1}>debug value</CodeStep> as a parameter and should return a <CodeStep step={2}>formatted display value</CodeStep>. When your component is inspected, React DevTools will call this function and display its result.

This lets you avoid running potentially expensive formatting logic unless the component is actually inspected. For example, if `date` is a Date value, this avoids calling `toDateString()` on it for every render.
