---
title: useInsertionEffect
---

<Pitfall>

`useInsertionEffect` is for CSS-in-JS library authors. Unless you are working on a CSS-in-JS library and need a place to inject the styles, you probably want [`useEffect`](/reference/react/useEffect) or [`useLayoutEffect`](/reference/react/useLayoutEffect) instead.

</Pitfall>

<Intro>

`useInsertionEffect` allows inserting elements into the DOM before any layout Effects fire.

```js
useInsertionEffect(setup, dependencies?)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useInsertionEffect(setup, dependencies?)` {/_useinsertioneffect_/}

Call `useInsertionEffect` to insert styles before any Effects fire that may need to read layout:

```js
import { useInsertionEffect } from 'react'

// Inside your CSS-in-JS library
function useCSS(rule) {
  useInsertionEffect(() => {
    // ... inject <style> tags here ...
  })
  return rule
}
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `setup`: The function with your Effect's logic. Your setup function may also optionally return a _cleanup_ function. When your component is added to the DOM, but before any layout Effects fire, React will run your setup function. After every re-render with changed dependencies, React will first run the cleanup function (if you provided it) with the old values, and then run your setup function with the new values. When your component is removed from the DOM, React will run your cleanup function.

- **optional** `dependencies`: The list of all reactive values referenced inside of the `setup` code. Reactive values include props, state, and all the variables and functions declared directly inside your component body. If your linter is [configured for React](/learn/editor-setup#linting), it will verify that every reactive value is correctly specified as a dependency. The list of dependencies must have a constant number of items and be written inline like `[dep1, dep2, dep3]`. React will compare each dependency with its previous value using the [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) comparison algorithm. If you don't specify the dependencies at all, your Effect will re-run after every re-render of the component.

#### Returns {/_returns_/}

`useInsertionEffect` returns `undefined`.

#### Caveats {/_caveats_/}

- Effects only run on the client. They don't run during server rendering.
- You can't update state from inside `useInsertionEffect`.
- By the time `useInsertionEffect` runs, refs are not attached yet.
- `useInsertionEffect` may run either before or after the DOM has been updated. You shouldn't rely on the DOM being updated at any particular time.
- Unlike other types of Effects, which fire cleanup for every Effect and then setup for every Effect, `useInsertionEffect` will fire both cleanup and setup one component at a time. This results in an "interleaving" of the cleanup and setup functions.

---

## Usage {/_usage_/}

### Injecting dynamic styles from CSS-in-JS libraries {/_injecting-dynamic-styles-from-css-in-js-libraries_/}

Traditionally, you would style React components using plain CSS.

```js
// In your JS file:
<button className="success" />

// In your CSS file:
.success { color: green; }
```

Some teams prefer to author styles directly in JavaScript code instead of writing CSS files. This usually requires using a CSS-in-JS library or a tool. There are three common approaches to CSS-in-JS:

1. Static extraction to CSS files with a compiler
2. Inline styles, e.g. `<div style={{ opacity: 1 }}>`
3. Runtime injection of `<style>` tags

If you use CSS-in-JS, we recommend a combination of the first two approaches (CSS files for static styles, inline styles for dynamic styles). **We don't recommend runtime `<style>` tag injection for two reasons:**

1. Runtime injection forces the browser to recalculate the styles a lot more often.
2. Runtime injection can be very slow if it happens at the wrong time in the React lifecycle.

The first problem is not solvable, but `useInsertionEffect` helps you solve the second problem.

Call `useInsertionEffect` to insert the styles before any layout Effects fire:

```js {4-11}
// Inside your CSS-in-JS library
let isInserted = new Set()
function useCSS(rule) {
  useInsertionEffect(() => {
    // As explained earlier, we don't recommend runtime injection of <style> tags.
    // But if you have to do it, then it's important to do in useInsertionEffect.
    if (!isInserted.has(rule)) {
      isInserted.add(rule)
      document.head.appendChild(getStyleForRule(rule))
    }
  })
  return rule
}

function Button() {
  const className = useCSS('...')
  return <div className={className} />
}
```

Similarly to `useEffect`, `useInsertionEffect` does not run on the server. If you need to collect which CSS rules have been used on the server, you can do it during rendering:

```js {1,4-6}
let collectedRulesSet = new Set()

function useCSS(rule) {
  if (typeof window === 'undefined') {
    collectedRulesSet.add(rule)
  }
  useInsertionEffect(() => {
    // ...
  })
  return rule
}
```

[Read more about upgrading CSS-in-JS libraries with runtime injection to `useInsertionEffect`.](https://github.com/reactwg/react-18/discussions/110)

<DeepDive>

#### How is this better than injecting styles during rendering or useLayoutEffect? {/_how-is-this-better-than-injecting-styles-during-rendering-or-uselayouteffect_/}

If you insert styles during rendering and React is processing a [non-blocking update,](/reference/react/useTransition#perform-non-blocking-updates-with-actions) the browser will recalculate the styles every single frame while rendering a component tree, which can be **extremely slow.**

`useInsertionEffect` is better than inserting styles during [`useLayoutEffect`](/reference/react/useLayoutEffect) or [`useEffect`](/reference/react/useEffect) because it ensures that by the time other Effects run in your components, the `<style>` tags have already been inserted. Otherwise, layout calculations in regular Effects would be wrong due to outdated styles.

</DeepDive>
