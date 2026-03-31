---
title: use
---

<Intro>

`use` is a React API that lets you read the value of a resource like a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) or [context](/learn/passing-data-deeply-with-context).

```js
const value = use(resource)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `use(resource)` {/_use_/}

Call `use` in your component to read the value of a resource like a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) or [context](/learn/passing-data-deeply-with-context).

```jsx
import { use } from 'react';

function MessageComponent({ messagePromise }) {
  const message = use(messagePromise);
  const theme = use(ThemeContext);
  // ...
```

Unlike React Hooks, `use` can be called within loops and conditional statements like `if`. Like React Hooks, the function that calls `use` must be a Component or Hook.

When called with a Promise, the `use` API integrates with [`Suspense`](/reference/react/Suspense) and [Error Boundaries](/reference/react/Component#catching-rendering-errors-with-an-error-boundary). The component calling `use` _suspends_ while the Promise passed to `use` is pending. If the component that calls `use` is wrapped in a Suspense boundary, the fallback will be displayed. Once the Promise is resolved, the Suspense fallback is replaced by the rendered components using the data returned by the `use` API. If the Promise passed to `use` is rejected, the fallback of the nearest Error Boundary will be displayed.

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `resource`: this is the source of the data you want to read a value from. A resource can be a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) or a [context](/learn/passing-data-deeply-with-context).

#### Returns {/_returns_/}

The `use` API returns the value that was read from the resource like the resolved value of a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) or [context](/learn/passing-data-deeply-with-context).

#### Caveats {/_caveats_/}

- The `use` API must be called inside a Component or a Hook.
- When fetching data in a [Server Component](/reference/rsc/server-components), prefer `async` and `await` over `use`. `async` and `await` pick up rendering from the point where `await` was invoked, whereas `use` re-renders the component after the data is resolved.
- Prefer creating Promises in [Server Components](/reference/rsc/server-components) and passing them to [Client Components](/reference/rsc/use-client) over creating Promises in Client Components. Promises created in Client Components are recreated on every render. Promises passed from a Server Component to a Client Component are stable across re-renders. [See this example](#streaming-data-from-server-to-client).

---

## Usage {/_usage_/}

### Reading context with `use` {/_reading-context-with-use_/}

When a [context](/learn/passing-data-deeply-with-context) is passed to `use`, it works similarly to [`useContext`](/reference/react/useContext). While `useContext` must be called at the top level of your component, `use` can be called inside conditionals like `if` and loops like `for`. `use` is preferred over `useContext` because it is more flexible.

```js [[2, 4, "theme"], [1, 4, "ThemeContext"]]
import { use } from 'react';

function Button() {
  const theme = use(ThemeContext);
  // ...
```

`use` returns the <CodeStep step={2}>context value</CodeStep> for the <CodeStep step={1}>context</CodeStep> you passed. To determine the context value, React searches the component tree and finds **the closest context provider above** for that particular context.

To pass context to a `Button`, wrap it or one of its parent components into the corresponding context provider.

```js [[1, 3, "ThemeContext"], [2, 3, ""dark""], [1, 5, "ThemeContext"]]
function MyPage() {
  return (
    <ThemeContext value="dark">
      <Form />
    </ThemeContext>
  )
}

function Form() {
  // ... renders buttons inside ...
}
```

It doesn't matter how many layers of components there are between the provider and the `Button`. When a `Button` _anywhere_ inside of `Form` calls `use(ThemeContext)`, it will receive `"dark"` as the value.

Unlike [`useContext`](/reference/react/useContext), <CodeStep step={2}>`use`</CodeStep> can be called in conditionals and loops like <CodeStep step={1}>`if`</CodeStep>.

```js [[1, 2, "if"], [2, 3, "use"]]
function HorizontalRule({ show }) {
  if (show) {
    const theme = use(ThemeContext)
    return <hr className={theme} />
  }
  return false
}
```

<CodeStep step={2}>`use`</CodeStep> is called from inside a <CodeStep step={1}>`if`</CodeStep> statement, allowing you to conditionally read values from a Context.

<Pitfall>

Like `useContext`, `use(context)` always looks for the closest context provider _above_ the component that calls it. It searches upwards and **does not** consider context providers in the component from which you're calling `use(context)`.

</Pitfall>

<Sandpack>

```js
import { createContext, use } from 'react'

const ThemeContext = createContext(null)

export default function MyApp() {
  return (
    <ThemeContext value="dark">
      <Form />
    </ThemeContext>
  )
}

function Form() {
  return (
    <Panel title="Welcome">
      <Button show={true}>Sign up</Button>
      <Button show={false}>Log in</Button>
    </Panel>
  )
}

function Panel({ title, children }) {
  const theme = use(ThemeContext)
  const className = 'panel-' + theme
  return (
    <section className={className}>
      <h1>{title}</h1>
      {children}
    </section>
  )
}

function Button({ show, children }) {
  if (show) {
    const theme = use(ThemeContext)
    const className = 'button-' + theme
    return <button className={className}>{children}</button>
  }
  return false
}
```

```css
.panel-light,
.panel-dark {
  border: 1px solid black;
  border-radius: 4px;
  padding: 20px;
}
.panel-light {
  color: #222;
  background: #fff;
}

.panel-dark {
  color: #fff;
  background: rgb(23, 32, 42);
}

.button-light,
.button-dark {
  border: 1px solid #777;
  padding: 5px;
  margin-right: 10px;
  margin-top: 10px;
}

.button-dark {
  background: #222;
  color: #fff;
}

.button-light {
  background: #fff;
  color: #222;
}
```

</Sandpack>

### Streaming data from the server to the client {/_streaming-data-from-server-to-client_/}

Data can be streamed from the server to the client by passing a Promise as a prop from a <CodeStep step={1}>Server Component</CodeStep> to a <CodeStep step={2}>Client Component</CodeStep>.

```js [[1, 4, "App"], [2, 2, "Message"], [3, 7, "Suspense"], [4, 8, "messagePromise", 30], [4, 5, "messagePromise"]]
import { fetchMessage } from './lib.js'
import { Message } from './message.js'

export default function App() {
  const messagePromise = fetchMessage()
  return (
    <Suspense fallback={<p>waiting for message...</p>}>
      <Message messagePromise={messagePromise} />
    </Suspense>
  )
}
```

The <CodeStep step={2}>Client Component</CodeStep> then takes <CodeStep step={4}>the Promise it received as a prop</CodeStep> and passes it to the <CodeStep step={5}>`use`</CodeStep> API. This allows the <CodeStep step={2}>Client Component</CodeStep> to read the value from <CodeStep step={4}>the Promise</CodeStep> that was initially created by the Server Component.

```js [[2, 6, "Message"], [4, 6, "messagePromise"], [4, 7, "messagePromise"], [5, 7, "use"]]
// message.js
'use client'

import { use } from 'react'

export function Message({ messagePromise }) {
  const messageContent = use(messagePromise)
  return <p>Here is the message: {messageContent}</p>
}
```

Because <CodeStep step={2}>`Message`</CodeStep> is wrapped in <CodeStep step={3}>[`Suspense`](/reference/react/Suspense)</CodeStep>, the fallback will be displayed until the Promise is resolved. When the Promise is resolved, the value will be read by the <CodeStep step={5}>`use`</CodeStep> API and the <CodeStep step={2}>`Message`</CodeStep> component will replace the Suspense fallback.

<Sandpack>

```js src/message.js active
'use client'

import { use, Suspense } from 'react'

function Message({ messagePromise }) {
  const messageContent = use(messagePromise)
  return <p>Here is the message: {messageContent}</p>
}

export function MessageContainer({ messagePromise }) {
  return (
    <Suspense fallback={<p>⌛Downloading message...</p>}>
      <Message messagePromise={messagePromise} />
    </Suspense>
  )
}
```

```js src/App.js hidden
import { useState } from 'react'
import { MessageContainer } from './message.js'

function fetchMessage() {
  return new Promise((resolve) => setTimeout(resolve, 1000, '⚛️'))
}

export default function App() {
  const [messagePromise, setMessagePromise] = useState(null)
  const [show, setShow] = useState(false)
  function download() {
    setMessagePromise(fetchMessage())
    setShow(true)
  }

  if (show) {
    return <MessageContainer messagePromise={messagePromise} />
  } else {
    return <button onClick={download}>Download message</button>
  }
}
```

```js src/index.js hidden
import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

// TODO: update this example to use
// the Codesandbox Server Component
// demo environment once it is created
import App from './App'

const root = createRoot(document.getElementById('root'))
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

</Sandpack>

<Note>

When passing a Promise from a Server Component to a Client Component, its resolved value must be serializable to pass between server and client. Data types like functions aren't serializable and cannot be the resolved value of such a Promise.

</Note>

<DeepDive>

#### Should I resolve a Promise in a Server or Client Component? {/_resolve-promise-in-server-or-client-component_/}

A Promise can be passed from a Server Component to a Client Component and resolved in the Client Component with the `use` API. You can also resolve the Promise in a Server Component with `await` and pass the required data to the Client Component as a prop.

```js
export default async function App() {
  const messageContent = await fetchMessage()
  return <Message messageContent={messageContent} />
}
```

But using `await` in a [Server Component](/reference/rsc/server-components) will block its rendering until the `await` statement is finished. Passing a Promise from a Server Component to a Client Component prevents the Promise from blocking the rendering of the Server Component.

</DeepDive>

### Dealing with rejected Promises {/_dealing-with-rejected-promises_/}

In some cases a Promise passed to `use` could be rejected. You can handle rejected Promises by either:

1. [Displaying an error to users with an Error Boundary.](#displaying-an-error-to-users-with-error-boundary)
2. [Providing an alternative value with `Promise.catch`](#providing-an-alternative-value-with-promise-catch)

<Pitfall>
`use` cannot be called in a try-catch block. Instead of a try-catch block [wrap your component in an Error Boundary](#displaying-an-error-to-users-with-error-boundary), or [provide an alternative value to use with the Promise's `.catch` method](#providing-an-alternative-value-with-promise-catch).
</Pitfall>

#### Displaying an error to users with an Error Boundary {/_displaying-an-error-to-users-with-error-boundary_/}

If you'd like to display an error to your users when a Promise is rejected, you can use an [Error Boundary](/reference/react/Component#catching-rendering-errors-with-an-error-boundary). To use an Error Boundary, wrap the component where you are calling the `use` API in an Error Boundary. If the Promise passed to `use` is rejected the fallback for the Error Boundary will be displayed.

<Sandpack>

```js src/message.js active
'use client'

import { use, Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

export function MessageContainer({ messagePromise }) {
  return (
    <ErrorBoundary fallback={<p>⚠️Something went wrong</p>}>
      <Suspense fallback={<p>⌛Downloading message...</p>}>
        <Message messagePromise={messagePromise} />
      </Suspense>
    </ErrorBoundary>
  )
}

function Message({ messagePromise }) {
  const content = use(messagePromise)
  return <p>Here is the message: {content}</p>
}
```

```js src/App.js hidden
import { useState } from 'react'
import { MessageContainer } from './message.js'

function fetchMessage() {
  return new Promise((resolve, reject) => setTimeout(reject, 1000))
}

export default function App() {
  const [messagePromise, setMessagePromise] = useState(null)
  const [show, setShow] = useState(false)
  function download() {
    setMessagePromise(fetchMessage())
    setShow(true)
  }

  if (show) {
    return <MessageContainer messagePromise={messagePromise} />
  } else {
    return <button onClick={download}>Download message</button>
  }
}
```

```js src/index.js hidden
import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

// TODO: update this example to use
// the Codesandbox Server Component
// demo environment once it is created
import App from './App'

const root = createRoot(document.getElementById('root'))
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
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

#### Providing an alternative value with `Promise.catch` {/_providing-an-alternative-value-with-promise-catch_/}

If you'd like to provide an alternative value when the Promise passed to `use` is rejected you can use the Promise's <CodeStep step={1}>[`catch`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/catch)</CodeStep> method.

```js [[1, 6, "catch"],[2, 7, "return"]]
import { Message } from './message.js'

export default function App() {
  const messagePromise = new Promise((resolve, reject) => {
    reject()
  }).catch(() => {
    return 'no new message found.'
  })

  return (
    <Suspense fallback={<p>waiting for message...</p>}>
      <Message messagePromise={messagePromise} />
    </Suspense>
  )
}
```

To use the Promise's <CodeStep step={1}>`catch`</CodeStep> method, call <CodeStep step={1}>`catch`</CodeStep> on the Promise object. <CodeStep step={1}>`catch`</CodeStep> takes a single argument: a function that takes an error message as an argument. Whatever is <CodeStep step={2}>returned</CodeStep> by the function passed to <CodeStep step={1}>`catch`</CodeStep> will be used as the resolved value of the Promise.

---

## Troubleshooting {/_troubleshooting_/}

### "Suspense Exception: This is not a real error!" {/_suspense-exception-error_/}

You are either calling `use` outside of a React Component or Hook function, or calling `use` in a try–catch block. If you are calling `use` inside a try–catch block, wrap your component in an Error Boundary, or call the Promise's `catch` to catch the error and resolve the Promise with another value. [See these examples](#dealing-with-rejected-promises).

If you are calling `use` outside a React Component or Hook function, move the `use` call to a React Component or Hook function.

```jsx
function MessageComponent({messagePromise}) {
  function download() {
    // ❌ the function calling `use` is not a Component or Hook
    const message = use(messagePromise);
    // ...
```

Instead, call `use` outside any component closures, where the function that calls `use` is a Component or Hook.

```jsx
function MessageComponent({messagePromise}) {
  // ✅ `use` is being called from a component.
  const message = use(messagePromise);
  // ...
```
