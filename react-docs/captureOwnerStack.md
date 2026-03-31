---
title: captureOwnerStack
---

<Intro>

`captureOwnerStack` reads the current Owner Stack in development and returns it as a string if available.

```js
const stack = captureOwnerStack()
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `captureOwnerStack()` {/_captureownerstack_/}

Call `captureOwnerStack` to get the current Owner Stack.

```js {5,5}
import * as React from 'react'

function Component() {
  if (process.env.NODE_ENV !== 'production') {
    const ownerStack = React.captureOwnerStack()
    console.log(ownerStack)
  }
}
```

#### Parameters {/_parameters_/}

`captureOwnerStack` does not take any parameters.

#### Returns {/_returns_/}

`captureOwnerStack` returns `string | null`.

Owner Stacks are available in

- Component render
- Effects (e.g. `useEffect`)
- React's event handlers (e.g. `<button onClick={...} />`)
- React error handlers ([React Root options](/reference/react-dom/client/createRoot#parameters) `onCaughtError`, `onRecoverableError`, and `onUncaughtError`)

If no Owner Stack is available, `null` is returned (see [Troubleshooting: The Owner Stack is `null`](#the-owner-stack-is-null)).

#### Caveats {/_caveats_/}

- Owner Stacks are only available in development. `captureOwnerStack` will always return `null` outside of development.

<DeepDive>

#### Owner Stack vs Component Stack {/_owner-stack-vs-component-stack_/}

The Owner Stack is different from the Component Stack available in React error handlers like [`errorInfo.componentStack` in `onUncaughtError`](/reference/react-dom/client/hydrateRoot#error-logging-in-production).

For example, consider the following code:

<Sandpack>

```js src/App.js
import { Suspense } from 'react'

function SubComponent({ disabled }) {
  if (disabled) {
    throw new Error('disabled')
  }
}

export function Component({ label }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <SubComponent key={label} disabled={label === 'disabled'} />
    </fieldset>
  )
}

function Navigation() {
  return null
}

export default function App({ children }) {
  return (
    <Suspense fallback="loading...">
      <main>
        <Navigation />
        {children}
      </main>
    </Suspense>
  )
}
```

```js src/index.js
import { captureOwnerStack } from 'react'
import { createRoot } from 'react-dom/client'
import App, { Component } from './App.js'
import './styles.css'

createRoot(document.createElement('div'), {
  onUncaughtError: (error, errorInfo) => {
    // The stacks are logged instead of showing them in the UI directly to
    // highlight that browsers will apply sourcemaps to the logged stacks.
    // Note that sourcemapping is only applied in the real browser console not
    // in the fake one displayed on this page.
    // Press "fork" to be able to view the sourcemapped stack in a real console.
    console.log(errorInfo.componentStack)
    console.log(captureOwnerStack())
  },
}).render(
  <App>
    <Component label="disabled" />
  </App>
)
```

```html public/index.html hidden
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>
    <p>Check the console output.</p>
  </body>
</html>
```

</Sandpack>

`SubComponent` would throw an error.
The Component Stack of that error would be

```
at SubComponent
at fieldset
at Component
at main
at React.Suspense
at App
```

However, the Owner Stack would only read

```
at Component
```

Neither `App` nor the DOM components (e.g. `fieldset`) are considered Owners in this Stack since they didn't contribute to "creating" the node containing `SubComponent`. `App` and DOM components only forwarded the node. `App` just rendered the `children` node as opposed to `Component` which created a node containing `SubComponent` via `<SubComponent />`.

Neither `Navigation` nor `legend` are in the stack at all since it's only a sibling to a node containing `<SubComponent />`.

`SubComponent` is omitted because it's already part of the callstack.

</DeepDive>

## Usage {/_usage_/}

### Enhance a custom error overlay {/_enhance-a-custom-error-overlay_/}

```js [[1, 5, "console.error"], [4, 7, "captureOwnerStack"]]
import { captureOwnerStack } from 'react'
import { instrumentedConsoleError } from './errorOverlay'

const originalConsoleError = console.error
console.error = function patchedConsoleError(...args) {
  originalConsoleError.apply(console, args)
  const ownerStack = captureOwnerStack()
  onConsoleError({
    // Keep in mind that in a real application, console.error can be
    // called with multiple arguments which you should account for.
    consoleMessage: args[0],
    ownerStack,
  })
}
```

If you intercept <CodeStep step={1}>`console.error`</CodeStep> calls to highlight them in an error overlay, you can call <CodeStep step={2}>`captureOwnerStack`</CodeStep> to include the Owner Stack.

<Sandpack>

```css src/styles.css
* {
  box-sizing: border-box;
}

body {
  font-family: sans-serif;
  margin: 20px;
  padding: 0;
}

h1 {
  margin-top: 0;
  font-size: 22px;
}

h2 {
  margin-top: 0;
  font-size: 20px;
}

code {
  font-size: 1.2em;
}

ul {
  padding-inline-start: 20px;
}

label,
button {
  display: block;
  margin-bottom: 20px;
}
html,
body {
  min-height: 300px;
}

#error-dialog {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-color: white;
  padding: 15px;
  opacity: 0.9;
  text-wrap: wrap;
  overflow: scroll;
}

.text-red {
  color: red;
}

.-mb-20 {
  margin-bottom: -20px;
}

.mb-0 {
  margin-bottom: 0;
}

.mb-10 {
  margin-bottom: 10px;
}

pre {
  text-wrap: wrap;
}

pre.nowrap {
  text-wrap: nowrap;
}

.hidden {
  display: none;
}
```

```html public/index.html hidden
<!DOCTYPE html>
<html>
<head>
  <title>My app</title>
</head>
<body>
<!--
  Error dialog in raw HTML
  since an error in the React app may crash.
-->
<div id="error-dialog" class="hidden">
  <h1 id="error-title" class="text-red">Error</h1>
  <p>
    <pre id="error-body"></pre>
  </p>
  <h2 class="-mb-20">Owner Stack:</h4>
  <pre id="error-owner-stack" class="nowrap"></pre>
  <button
    id="error-close"
    class="mb-10"
    onclick="document.getElementById('error-dialog').classList.add('hidden')"
  >
    Close
  </button>
</div>
<!-- This is the DOM node -->
<div id="root"></div>
</body>
</html>

```

```js src/errorOverlay.js
export function onConsoleError({ consoleMessage, ownerStack }) {
  const errorDialog = document.getElementById('error-dialog')
  const errorBody = document.getElementById('error-body')
  const errorOwnerStack = document.getElementById('error-owner-stack')

  // Display console.error() message
  errorBody.innerText = consoleMessage

  // Display owner stack
  errorOwnerStack.innerText = ownerStack

  // Show the dialog
  errorDialog.classList.remove('hidden')
}
```

```js src/index.js active
import { captureOwnerStack } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { onConsoleError } from './errorOverlay'
import './styles.css'

const originalConsoleError = console.error
console.error = function patchedConsoleError(...args) {
  originalConsoleError.apply(console, args)
  const ownerStack = captureOwnerStack()
  onConsoleError({
    // Keep in mind that in a real application, console.error can be
    // called with multiple arguments which you should account for.
    consoleMessage: args[0],
    ownerStack,
  })
}

const container = document.getElementById('root')
createRoot(container).render(<App />)
```

```js src/App.js
function Component() {
  return (
    <button onClick={() => console.error('Some console error')}>
      Trigger console.error()
    </button>
  )
}

export default function App() {
  return <Component />
}
```

</Sandpack>

## Troubleshooting {/_troubleshooting_/}

### The Owner Stack is `null` {/_the-owner-stack-is-null_/}

The call of `captureOwnerStack` happened outside of a React controlled function e.g. in a `setTimeout` callback, after a `fetch` call or in a custom DOM event handler. During render, Effects, React event handlers, and React error handlers (e.g. `hydrateRoot#options.onCaughtError`) Owner Stacks should be available.

In the example below, clicking the button will log an empty Owner Stack because `captureOwnerStack` was called during a custom DOM event handler. The Owner Stack must be captured earlier e.g. by moving the call of `captureOwnerStack` into the Effect body.
<Sandpack>

```js
import { captureOwnerStack, useEffect } from 'react'

export default function App() {
  useEffect(() => {
    // Should call `captureOwnerStack` here.
    function handleEvent() {
      // Calling it in a custom DOM event handler is too late.
      // The Owner Stack will be `null` at this point.
      console.log('Owner Stack: ', captureOwnerStack())
    }

    document.addEventListener('click', handleEvent)

    return () => {
      document.removeEventListener('click', handleEvent)
    }
  })

  return (
    <button>
      Click me to see that Owner Stacks are not available in custom DOM event
      handlers
    </button>
  )
}
```

</Sandpack>

### `captureOwnerStack` is not available {/_captureownerstack-is-not-available_/}

`captureOwnerStack` is only exported in development builds. It will be `undefined` in production builds. If `captureOwnerStack` is used in files that are bundled for production and development, you should conditionally access it from a namespace import.

```js
// Don't use named imports of `captureOwnerStack` in files that are bundled for development and production.
import { captureOwnerStack } from 'react'
// Use a namespace import instead and access `captureOwnerStack` conditionally.
import * as React from 'react'

if (process.env.NODE_ENV !== 'production') {
  const ownerStack = React.captureOwnerStack()
  console.log('Owner Stack', ownerStack)
}
```
