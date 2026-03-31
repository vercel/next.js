---
title: 'Built-in React APIs'
---

<Intro>

In addition to [Hooks](/reference/react/hooks) and [Components](/reference/react/components), the `react` package exports a few other APIs that are useful for defining components. This page lists all the remaining modern React APIs.

</Intro>

---

- [`createContext`](/reference/react/createContext) lets you define and provide context to the child components. Used with [`useContext`.](/reference/react/useContext)
- [`lazy`](/reference/react/lazy) lets you defer loading a component's code until it's rendered for the first time.
- [`memo`](/reference/react/memo) lets your component skip re-renders with same props. Used with [`useMemo`](/reference/react/useMemo) and [`useCallback`.](/reference/react/useCallback)
- [`startTransition`](/reference/react/startTransition) lets you mark a state update as non-urgent. Similar to [`useTransition`.](/reference/react/useTransition)
- [`act`](/reference/react/act) lets you wrap renders and interactions in tests to ensure updates have processed before making assertions.

---

## Resource APIs {/_resource-apis_/}

_Resources_ can be accessed by a component without having them as part of their state. For example, a component can read a message from a Promise or read styling information from a context.

To read a value from a resource, use this API:

- [`use`](/reference/react/use) lets you read the value of a resource like a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) or [context](/learn/passing-data-deeply-with-context).

```js
function MessageComponent({ messagePromise }) {
  const message = use(messagePromise)
  const theme = use(ThemeContext)
  // ...
}
```
