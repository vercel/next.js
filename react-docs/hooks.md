---
title: 'Built-in React Hooks'
---

<Intro>

_Hooks_ let you use different React features from your components. You can either use the built-in Hooks or combine them to build your own. This page lists all built-in Hooks in React.

</Intro>

---

## State Hooks {/_state-hooks_/}

_State_ lets a component ["remember" information like user input.](/learn/state-a-components-memory) For example, a form component can use state to store the input value, while an image gallery component can use state to store the selected image index.

To add state to a component, use one of these Hooks:

- [`useState`](/reference/react/useState) declares a state variable that you can update directly.
- [`useReducer`](/reference/react/useReducer) declares a state variable with the update logic inside a [reducer function.](/learn/extracting-state-logic-into-a-reducer)

```js
function ImageGallery() {
  const [index, setIndex] = useState(0);
  // ...
```

---

## Context Hooks {/_context-hooks_/}

_Context_ lets a component [receive information from distant parents without passing it as props.](/learn/passing-props-to-a-component) For example, your app's top-level component can pass the current UI theme to all components below, no matter how deep.

- [`useContext`](/reference/react/useContext) reads and subscribes to a context.

```js
function Button() {
  const theme = useContext(ThemeContext);
  // ...
```

---

## Ref Hooks {/_ref-hooks_/}

_Refs_ let a component [hold some information that isn't used for rendering,](/learn/referencing-values-with-refs) like a DOM node or a timeout ID. Unlike with state, updating a ref does not re-render your component. Refs are an "escape hatch" from the React paradigm. They are useful when you need to work with non-React systems, such as the built-in browser APIs.

- [`useRef`](/reference/react/useRef) declares a ref. You can hold any value in it, but most often it's used to hold a DOM node.
- [`useImperativeHandle`](/reference/react/useImperativeHandle) lets you customize the ref exposed by your component. This is rarely used.

```js
function Form() {
  const inputRef = useRef(null);
  // ...
```

---

## Effect Hooks {/_effect-hooks_/}

_Effects_ let a component [connect to and synchronize with external systems.](/learn/synchronizing-with-effects) This includes dealing with network, browser DOM, animations, widgets written using a different UI library, and other non-React code.

- [`useEffect`](/reference/react/useEffect) connects a component to an external system.

```js
function ChatRoom({ roomId }) {
  useEffect(() => {
    const connection = createConnection(roomId);
    connection.connect();
    return () => connection.disconnect();
  }, [roomId]);
  // ...
```

Effects are an "escape hatch" from the React paradigm. Don't use Effects to orchestrate the data flow of your application. If you're not interacting with an external system, [you might not need an Effect.](/learn/you-might-not-need-an-effect)

There are two rarely used variations of `useEffect` with differences in timing:

- [`useLayoutEffect`](/reference/react/useLayoutEffect) fires before the browser repaints the screen. You can measure layout here.
- [`useInsertionEffect`](/reference/react/useInsertionEffect) fires before React makes changes to the DOM. Libraries can insert dynamic CSS here.

You can also separate events from Effects:

- [`useEffectEvent`](/reference/react/useEffectEvent) creates a non-reactive event to fire from any Effect hook.

---

## Performance Hooks {/_performance-hooks_/}

A common way to optimize re-rendering performance is to skip unnecessary work. For example, you can tell React to reuse a cached calculation or to skip a re-render if the data has not changed since the previous render.

To skip calculations and unnecessary re-rendering, use one of these Hooks:

- [`useMemo`](/reference/react/useMemo) lets you cache the result of an expensive calculation.
- [`useCallback`](/reference/react/useCallback) lets you cache a function definition before passing it down to an optimized component.

```js
function TodoList({ todos, tab, theme }) {
  const visibleTodos = useMemo(() => filterTodos(todos, tab), [todos, tab])
  // ...
}
```

Sometimes, you can't skip re-rendering because the screen actually needs to update. In that case, you can improve performance by separating blocking updates that must be synchronous (like typing into an input) from non-blocking updates which don't need to block the user interface (like updating a chart).

To prioritize rendering, use one of these Hooks:

- [`useTransition`](/reference/react/useTransition) lets you mark a state transition as non-blocking and allow other updates to interrupt it.
- [`useDeferredValue`](/reference/react/useDeferredValue) lets you defer updating a non-critical part of the UI and let other parts update first.

---

## Other Hooks {/_other-hooks_/}

These Hooks are mostly useful to library authors and aren't commonly used in the application code.

- [`useDebugValue`](/reference/react/useDebugValue) lets you customize the label React DevTools displays for your custom Hook.
- [`useId`](/reference/react/useId) lets a component associate a unique ID with itself. Typically used with accessibility APIs.
- [`useSyncExternalStore`](/reference/react/useSyncExternalStore) lets a component subscribe to an external store.

* [`useActionState`](/reference/react/useActionState) allows you to manage state of actions.

---

## Your own Hooks {/_your-own-hooks_/}

You can also [define your own custom Hooks](/learn/reusing-logic-with-custom-hooks#extracting-your-own-custom-hook-from-a-component) as JavaScript functions.
