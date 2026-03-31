---
title: useEffect
---

<Intro>

`useEffect` is a React Hook that lets you [synchronize a component with an external system.](/learn/synchronizing-with-effects)

```js
useEffect(setup, dependencies?)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useEffect(setup, dependencies?)` {/_useeffect_/}

Call `useEffect` at the top level of your component to declare an Effect:

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234')

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => {
      connection.disconnect()
    }
  }, [serverUrl, roomId])
  // ...
}
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `setup`: The function with your Effect's logic. Your setup function may also optionally return a _cleanup_ function. When your [component commits](/learn/render-and-commit#step-3-react-commits-changes-to-the-dom), React will run your setup function. After every commit with changed dependencies, React will first run the cleanup function (if you provided it) with the old values, and then run your setup function with the new values. After your component is removed from the DOM, React will run your cleanup function.

- **optional** `dependencies`: The list of all reactive values referenced inside of the `setup` code. Reactive values include props, state, and all the variables and functions declared directly inside your component body. If your linter is [configured for React](/learn/editor-setup#linting), it will verify that every reactive value is correctly specified as a dependency. The list of dependencies must have a constant number of items and be written inline like `[dep1, dep2, dep3]`. React will compare each dependency with its previous value using the [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) comparison. If you omit this argument, your Effect will re-run after every commit of the component. [See the difference between passing an array of dependencies, an empty array, and no dependencies at all.](#examples-dependencies)

#### Returns {/_returns_/}

`useEffect` returns `undefined`.

#### Caveats {/_caveats_/}

- `useEffect` is a Hook, so you can only call it **at the top level of your component** or your own Hooks. You can't call it inside loops or conditions. If you need that, extract a new component and move the state into it.

- If you're **not trying to synchronize with some external system,** [you probably don't need an Effect.](/learn/you-might-not-need-an-effect)

- When Strict Mode is on, React will **run one extra development-only setup+cleanup cycle** before the first real setup. This is a stress-test that ensures that your cleanup logic "mirrors" your setup logic and that it stops or undoes whatever the setup is doing. If this causes a problem, [implement the cleanup function.](/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development)

- If some of your dependencies are objects or functions defined inside the component, there is a risk that they will **cause the Effect to re-run more often than needed.** To fix this, remove unnecessary [object](#removing-unnecessary-object-dependencies) and [function](#removing-unnecessary-function-dependencies) dependencies. You can also [extract state updates](#updating-state-based-on-previous-state-from-an-effect) and [non-reactive logic](#reading-the-latest-props-and-state-from-an-effect) outside of your Effect.

- If your Effect wasn't caused by an interaction (like a click), React will generally let the browser **paint the updated screen first before running your Effect.** If your Effect is doing something visual (for example, positioning a tooltip), and the delay is noticeable (for example, it flickers), replace `useEffect` with [`useLayoutEffect`.](/reference/react/useLayoutEffect)

- If your Effect is caused by an interaction (like a click), **React may run your Effect before the browser paints the updated screen**. This ensures that the result of the Effect can be observed by the event system. Usually, this works as expected. However, if you must defer the work until after paint, such as an `alert()`, you can use `setTimeout`. See [reactwg/react-18/128](https://github.com/reactwg/react-18/discussions/128) for more information.

- Even if your Effect was caused by an interaction (like a click), **React may allow the browser to repaint the screen before processing the state updates inside your Effect.** Usually, this works as expected. However, if you must block the browser from repainting the screen, you need to replace `useEffect` with [`useLayoutEffect`.](/reference/react/useLayoutEffect)

- Effects **only run on the client.** They don't run during server rendering.

---

## Usage {/_usage_/}

### Connecting to an external system {/_connecting-to-an-external-system_/}

Some components need to stay connected to the network, some browser API, or a third-party library, while they are displayed on the page. These systems aren't controlled by React, so they are called _external._

To [connect your component to some external system,](/learn/synchronizing-with-effects) call `useEffect` at the top level of your component:

```js [[1, 8, "const connection = createConnection(serverUrl, roomId);"], [1, 9, "connection.connect();"], [2, 11, "connection.disconnect();"], [3, 13, "[serverUrl, roomId]"]]
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234')

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => {
      connection.disconnect()
    }
  }, [serverUrl, roomId])
  // ...
}
```

You need to pass two arguments to `useEffect`:

1. A _setup function_ with <CodeStep step={1}>setup code</CodeStep> that connects to that system.
   - It should return a _cleanup function_ with <CodeStep step={2}>cleanup code</CodeStep> that disconnects from that system.
2. A <CodeStep step={3}>list of dependencies</CodeStep> including every value from your component used inside of those functions.

**React calls your setup and cleanup functions whenever it's necessary, which may happen multiple times:**

1. Your <CodeStep step={1}>setup code</CodeStep> runs when your component is added to the page _(mounts)_.
2. After every commit of your component where the <CodeStep step={3}>dependencies</CodeStep> have changed:
   - First, your <CodeStep step={2}>cleanup code</CodeStep> runs with the old props and state.
   - Then, your <CodeStep step={1}>setup code</CodeStep> runs with the new props and state.
3. Your <CodeStep step={2}>cleanup code</CodeStep> runs one final time after your component is removed from the page _(unmounts)._

**Let's illustrate this sequence for the example above.**

When the `ChatRoom` component above gets added to the page, it will connect to the chat room with the initial `serverUrl` and `roomId`. If either `serverUrl` or `roomId` change as a result of a commit (say, if the user picks a different chat room in a dropdown), your Effect will _disconnect from the previous room, and connect to the next one._ When the `ChatRoom` component is removed from the page, your Effect will disconnect one last time.

**To [help you find bugs,](/learn/synchronizing-with-effects#step-3-add-cleanup-if-needed) in development React runs <CodeStep step={1}>setup</CodeStep> and <CodeStep step={2}>cleanup</CodeStep> one extra time before the <CodeStep step={1}>setup</CodeStep>.** This is a stress-test that verifies your Effect's logic is implemented correctly. If this causes visible issues, your cleanup function is missing some logic. The cleanup function should stop or undo whatever the setup function was doing. The rule of thumb is that the user shouldn't be able to distinguish between the setup being called once (as in production) and a _setup_ → _cleanup_ → _setup_ sequence (as in development). [See common solutions.](/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development)

**Try to [write every Effect as an independent process](/learn/lifecycle-of-reactive-effects#each-effect-represents-a-separate-synchronization-process) and [think about a single setup/cleanup cycle at a time.](/learn/lifecycle-of-reactive-effects#thinking-from-the-effects-perspective)** It shouldn't matter whether your component is mounting, updating, or unmounting. When your cleanup logic correctly "mirrors" the setup logic, your Effect is resilient to running setup and cleanup as often as needed.

<Note>

An Effect lets you [keep your component synchronized](/learn/synchronizing-with-effects) with some external system (like a chat service). Here, _external system_ means any piece of code that's not controlled by React, such as:

- A timer managed with <CodeStep step={1}>[`setInterval()`](https://developer.mozilla.org/en-US/docs/Web/API/setInterval)</CodeStep> and <CodeStep step={2}>[`clearInterval()`](https://developer.mozilla.org/en-US/docs/Web/API/clearInterval)</CodeStep>.
- An event subscription using <CodeStep step={1}>[`window.addEventListener()`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)</CodeStep> and <CodeStep step={2}>[`window.removeEventListener()`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/removeEventListener)</CodeStep>.
- A third-party animation library with an API like <CodeStep step={1}>`animation.start()`</CodeStep> and <CodeStep step={2}>`animation.reset()`</CodeStep>.

**If you're not connecting to any external system, [you probably don't need an Effect.](/learn/you-might-not-need-an-effect)**

</Note>

<Recipes titleText="Examples of connecting to an external system" titleId="examples-connecting">

#### Connecting to a chat server {/_connecting-to-a-chat-server_/}

In this example, the `ChatRoom` component uses an Effect to stay connected to an external system defined in `chat.js`. Press "Open chat" to make the `ChatRoom` component appear. This sandbox runs in development mode, so there is an extra connect-and-disconnect cycle, as [explained here.](/learn/synchronizing-with-effects#step-3-add-cleanup-if-needed) Try changing the `roomId` and `serverUrl` using the dropdown and the input, and see how the Effect re-connects to the chat. Press "Close chat" to see the Effect disconnect one last time.

<Sandpack>

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234')

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => {
      connection.disconnect()
    }
  }, [roomId, serverUrl])

  return (
    <>
      <label>
        Server URL:{' '}
        <input
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
        />
      </label>
      <h1>Welcome to the {roomId} room!</h1>
    </>
  )
}

export default function App() {
  const [roomId, setRoomId] = useState('general')
  const [show, setShow] = useState(false)
  return (
    <>
      <label>
        Choose the chat room:{' '}
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="general">general</option>
          <option value="travel">travel</option>
          <option value="music">music</option>
        </select>
      </label>
      <button onClick={() => setShow(!show)}>
        {show ? 'Close chat' : 'Open chat'}
      </button>
      {show && <hr />}
      {show && <ChatRoom roomId={roomId} />}
    </>
  )
}
```

```js src/chat.js
export function createConnection(serverUrl, roomId) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
    },
  }
}
```

```css
input {
  display: block;
  margin-bottom: 20px;
}
button {
  margin-left: 10px;
}
```

</Sandpack>

<Solution />

#### Listening to a global browser event {/_listening-to-a-global-browser-event_/}

In this example, the external system is the browser DOM itself. Normally, you'd specify event listeners with JSX, but you can't listen to the global [`window`](https://developer.mozilla.org/en-US/docs/Web/API/Window) object this way. An Effect lets you connect to the `window` object and listen to its events. Listening to the `pointermove` event lets you track the cursor (or finger) position and update the red dot to move with it.

<Sandpack>

```js
import { useState, useEffect } from 'react'

export default function App() {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    function handleMove(e) {
      setPosition({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener('pointermove', handleMove)
    return () => {
      window.removeEventListener('pointermove', handleMove)
    }
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        backgroundColor: 'pink',
        borderRadius: '50%',
        opacity: 0.6,
        transform: `translate(${position.x}px, ${position.y}px)`,
        pointerEvents: 'none',
        left: -20,
        top: -20,
        width: 40,
        height: 40,
      }}
    />
  )
}
```

```css
body {
  min-height: 300px;
}
```

</Sandpack>

<Solution />

#### Triggering an animation {/_triggering-an-animation_/}

In this example, the external system is the animation library in `animation.js`. It provides a JavaScript class called `FadeInAnimation` that takes a DOM node as an argument and exposes `start()` and `stop()` methods to control the animation. This component [uses a ref](/learn/manipulating-the-dom-with-refs) to access the underlying DOM node. The Effect reads the DOM node from the ref and automatically starts the animation for that node when the component appears.

<Sandpack>

```js
import { useState, useEffect, useRef } from 'react'
import { FadeInAnimation } from './animation.js'

function Welcome() {
  const ref = useRef(null)

  useEffect(() => {
    const animation = new FadeInAnimation(ref.current)
    animation.start(1000)
    return () => {
      animation.stop()
    }
  }, [])

  return (
    <h1
      ref={ref}
      style={{
        opacity: 0,
        color: 'white',
        padding: 50,
        textAlign: 'center',
        fontSize: 50,
        backgroundImage:
          'radial-gradient(circle, rgba(63,94,251,1) 0%, rgba(252,70,107,1) 100%)',
      }}
    >
      Welcome
    </h1>
  )
}

export default function App() {
  const [show, setShow] = useState(false)
  return (
    <>
      <button onClick={() => setShow(!show)}>{show ? 'Remove' : 'Show'}</button>
      <hr />
      {show && <Welcome />}
    </>
  )
}
```

```js src/animation.js
export class FadeInAnimation {
  constructor(node) {
    this.node = node
  }
  start(duration) {
    this.duration = duration
    if (this.duration === 0) {
      // Jump to end immediately
      this.onProgress(1)
    } else {
      this.onProgress(0)
      // Start animating
      this.startTime = performance.now()
      this.frameId = requestAnimationFrame(() => this.onFrame())
    }
  }
  onFrame() {
    const timePassed = performance.now() - this.startTime
    const progress = Math.min(timePassed / this.duration, 1)
    this.onProgress(progress)
    if (progress < 1) {
      // We still have more frames to paint
      this.frameId = requestAnimationFrame(() => this.onFrame())
    }
  }
  onProgress(progress) {
    this.node.style.opacity = progress
  }
  stop() {
    cancelAnimationFrame(this.frameId)
    this.startTime = null
    this.frameId = null
    this.duration = 0
  }
}
```

```css
label,
button {
  display: block;
  margin-bottom: 20px;
}
html,
body {
  min-height: 300px;
}
```

</Sandpack>

<Solution />

#### Controlling a modal dialog {/_controlling-a-modal-dialog_/}

In this example, the external system is the browser DOM. The `ModalDialog` component renders a [`<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog) element. It uses an Effect to synchronize the `isOpen` prop to the [`showModal()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal) and [`close()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/close) method calls.

<Sandpack>

```js
import { useState } from 'react'
import ModalDialog from './ModalDialog.js'

export default function App() {
  const [show, setShow] = useState(false)
  return (
    <>
      <button onClick={() => setShow(true)}>Open dialog</button>
      <ModalDialog isOpen={show}>
        Hello there!
        <br />
        <button
          onClick={() => {
            setShow(false)
          }}
        >
          Close
        </button>
      </ModalDialog>
    </>
  )
}
```

```js src/ModalDialog.js active
import { useEffect, useRef } from 'react'

export default function ModalDialog({ isOpen, children }) {
  const ref = useRef()

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const dialog = ref.current
    dialog.showModal()
    return () => {
      dialog.close()
    }
  }, [isOpen])

  return <dialog ref={ref}>{children}</dialog>
}
```

```css
body {
  min-height: 300px;
}
```

</Sandpack>

<Solution />

#### Tracking element visibility {/_tracking-element-visibility_/}

In this example, the external system is again the browser DOM. The `App` component displays a long list, then a `Box` component, and then another long list. Scroll the list down. Notice that when all of the `Box` component is fully visible in the viewport, the background color changes to black. To implement this, the `Box` component uses an Effect to manage an [`IntersectionObserver`](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API). This browser API notifies you when the DOM element is visible in the viewport.

<Sandpack>

```js
import Box from './Box.js'

export default function App() {
  return (
    <>
      <LongSection />
      <Box />
      <LongSection />
      <Box />
      <LongSection />
    </>
  )
}

function LongSection() {
  const items = []
  for (let i = 0; i < 50; i++) {
    items.push(<li key={i}>Item #{i} (keep scrolling)</li>)
  }
  return <ul>{items}</ul>
}
```

```js src/Box.js active
import { useRef, useEffect } from 'react'

export default function Box() {
  const ref = useRef(null)

  useEffect(() => {
    const div = ref.current
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting) {
          document.body.style.backgroundColor = 'black'
          document.body.style.color = 'white'
        } else {
          document.body.style.backgroundColor = 'white'
          document.body.style.color = 'black'
        }
      },
      {
        threshold: 1.0,
      }
    )
    observer.observe(div)
    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div
      ref={ref}
      style={{
        margin: 20,
        height: 100,
        width: 100,
        border: '2px solid black',
        backgroundColor: 'blue',
      }}
    />
  )
}
```

</Sandpack>

<Solution />

</Recipes>

---

### Wrapping Effects in custom Hooks {/_wrapping-effects-in-custom-hooks_/}

Effects are an ["escape hatch":](/learn/escape-hatches) you use them when you need to "step outside React" and when there is no better built-in solution for your use case. If you find yourself often needing to manually write Effects, it's usually a sign that you need to extract some [custom Hooks](/learn/reusing-logic-with-custom-hooks) for common behaviors your components rely on.

For example, this `useChatRoom` custom Hook "hides" the logic of your Effect behind a more declarative API:

```js {1,11}
function useChatRoom({ serverUrl, roomId }) {
  useEffect(() => {
    const options = {
      serverUrl: serverUrl,
      roomId: roomId,
    }
    const connection = createConnection(options)
    connection.connect()
    return () => connection.disconnect()
  }, [roomId, serverUrl])
}
```

Then you can use it from any component like this:

```js {4-7}
function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234');

  useChatRoom({
    roomId: roomId,
    serverUrl: serverUrl
  });
  // ...
```

There are also many excellent custom Hooks for every purpose available in the React ecosystem.

[Learn more about wrapping Effects in custom Hooks.](/learn/reusing-logic-with-custom-hooks)

<Recipes titleText="Examples of wrapping Effects in custom Hooks" titleId="examples-custom-hooks">

#### Custom `useChatRoom` Hook {/_custom-usechatroom-hook_/}

This example is identical to one of the [earlier examples,](#examples-connecting) but the logic is extracted to a custom Hook.

<Sandpack>

```js
import { useState } from 'react'
import { useChatRoom } from './useChatRoom.js'

function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234')

  useChatRoom({
    roomId: roomId,
    serverUrl: serverUrl,
  })

  return (
    <>
      <label>
        Server URL:{' '}
        <input
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
        />
      </label>
      <h1>Welcome to the {roomId} room!</h1>
    </>
  )
}

export default function App() {
  const [roomId, setRoomId] = useState('general')
  const [show, setShow] = useState(false)
  return (
    <>
      <label>
        Choose the chat room:{' '}
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="general">general</option>
          <option value="travel">travel</option>
          <option value="music">music</option>
        </select>
      </label>
      <button onClick={() => setShow(!show)}>
        {show ? 'Close chat' : 'Open chat'}
      </button>
      {show && <hr />}
      {show && <ChatRoom roomId={roomId} />}
    </>
  )
}
```

```js src/useChatRoom.js
import { useEffect } from 'react'
import { createConnection } from './chat.js'

export function useChatRoom({ serverUrl, roomId }) {
  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => {
      connection.disconnect()
    }
  }, [roomId, serverUrl])
}
```

```js src/chat.js
export function createConnection(serverUrl, roomId) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
    },
  }
}
```

```css
input {
  display: block;
  margin-bottom: 20px;
}
button {
  margin-left: 10px;
}
```

</Sandpack>

<Solution />

#### Custom `useWindowListener` Hook {/_custom-usewindowlistener-hook_/}

This example is identical to one of the [earlier examples,](#examples-connecting) but the logic is extracted to a custom Hook.

<Sandpack>

```js
import { useState } from 'react'
import { useWindowListener } from './useWindowListener.js'

export default function App() {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useWindowListener('pointermove', (e) => {
    setPosition({ x: e.clientX, y: e.clientY })
  })

  return (
    <div
      style={{
        position: 'absolute',
        backgroundColor: 'pink',
        borderRadius: '50%',
        opacity: 0.6,
        transform: `translate(${position.x}px, ${position.y}px)`,
        pointerEvents: 'none',
        left: -20,
        top: -20,
        width: 40,
        height: 40,
      }}
    />
  )
}
```

```js src/useWindowListener.js
import { useState, useEffect } from 'react'

export function useWindowListener(eventType, listener) {
  useEffect(() => {
    window.addEventListener(eventType, listener)
    return () => {
      window.removeEventListener(eventType, listener)
    }
  }, [eventType, listener])
}
```

```css
body {
  min-height: 300px;
}
```

</Sandpack>

<Solution />

#### Custom `useIntersectionObserver` Hook {/_custom-useintersectionobserver-hook_/}

This example is identical to one of the [earlier examples,](#examples-connecting) but the logic is partially extracted to a custom Hook.

<Sandpack>

```js
import Box from './Box.js'

export default function App() {
  return (
    <>
      <LongSection />
      <Box />
      <LongSection />
      <Box />
      <LongSection />
    </>
  )
}

function LongSection() {
  const items = []
  for (let i = 0; i < 50; i++) {
    items.push(<li key={i}>Item #{i} (keep scrolling)</li>)
  }
  return <ul>{items}</ul>
}
```

```js src/Box.js active
import { useRef, useEffect } from 'react'
import { useIntersectionObserver } from './useIntersectionObserver.js'

export default function Box() {
  const ref = useRef(null)
  const isIntersecting = useIntersectionObserver(ref)

  useEffect(() => {
    if (isIntersecting) {
      document.body.style.backgroundColor = 'black'
      document.body.style.color = 'white'
    } else {
      document.body.style.backgroundColor = 'white'
      document.body.style.color = 'black'
    }
  }, [isIntersecting])

  return (
    <div
      ref={ref}
      style={{
        margin: 20,
        height: 100,
        width: 100,
        border: '2px solid black',
        backgroundColor: 'blue',
      }}
    />
  )
}
```

```js src/useIntersectionObserver.js
import { useState, useEffect } from 'react'

export function useIntersectionObserver(ref) {
  const [isIntersecting, setIsIntersecting] = useState(false)

  useEffect(() => {
    const div = ref.current
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        setIsIntersecting(entry.isIntersecting)
      },
      {
        threshold: 1.0,
      }
    )
    observer.observe(div)
    return () => {
      observer.disconnect()
    }
  }, [ref])

  return isIntersecting
}
```

</Sandpack>

<Solution />

</Recipes>

---

### Controlling a non-React widget {/_controlling-a-non-react-widget_/}

Sometimes, you want to keep an external system synchronized to some prop or state of your component.

For example, if you have a third-party map widget or a video player component written without React, you can use an Effect to call methods on it that make its state match the current state of your React component. This Effect creates an instance of a `MapWidget` class defined in `map-widget.js`. When you change the `zoomLevel` prop of the `Map` component, the Effect calls the `setZoom()` on the class instance to keep it synchronized:

<Sandpack>

```json package.json hidden
{
  "dependencies": {
    "leaflet": "1.9.1",
    "react": "latest",
    "react-dom": "latest",
    "react-scripts": "latest",
    "remarkable": "2.0.1"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test --env=jsdom",
    "eject": "react-scripts eject"
  }
}
```

```js src/App.js
import { useState } from 'react'
import Map from './Map.js'

export default function App() {
  const [zoomLevel, setZoomLevel] = useState(0)
  return (
    <>
      Zoom level: {zoomLevel}x
      <button onClick={() => setZoomLevel(zoomLevel + 1)}>+</button>
      <button onClick={() => setZoomLevel(zoomLevel - 1)}>-</button>
      <hr />
      <Map zoomLevel={zoomLevel} />
    </>
  )
}
```

```js src/Map.js active
import { useRef, useEffect } from 'react'
import { MapWidget } from './map-widget.js'

export default function Map({ zoomLevel }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (mapRef.current === null) {
      mapRef.current = new MapWidget(containerRef.current)
    }

    const map = mapRef.current
    map.setZoom(zoomLevel)
  }, [zoomLevel])

  return <div style={{ width: 200, height: 200 }} ref={containerRef} />
}
```

```js src/map-widget.js
import 'leaflet/dist/leaflet.css'
import * as L from 'leaflet'

export class MapWidget {
  constructor(domNode) {
    this.map = L.map(domNode, {
      zoomControl: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      scrollWheelZoom: false,
      zoomAnimation: false,
      touchZoom: false,
      zoomSnap: 0.1,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(this.map)
    this.map.setView([0, 0], 0)
  }
  setZoom(level) {
    this.map.setZoom(level)
  }
}
```

```css
button {
  margin: 5px;
}
```

</Sandpack>

In this example, a cleanup function is not needed because the `MapWidget` class manages only the DOM node that was passed to it. After the `Map` React component is removed from the tree, both the DOM node and the `MapWidget` class instance will be automatically garbage-collected by the browser JavaScript engine.

---

### Fetching data with Effects {/_fetching-data-with-effects_/}

You can use an Effect to fetch data for your component. Note that [if you use a framework,](/learn/creating-a-react-app#full-stack-frameworks) using your framework's data fetching mechanism will be a lot more efficient than writing Effects manually.

If you want to fetch data from an Effect manually, your code might look like this:

```js
import { useState, useEffect } from 'react';
import { fetchBio } from './api.js';

export default function Page() {
  const [person, setPerson] = useState('Alice');
  const [bio, setBio] = useState(null);

  useEffect(() => {
    let ignore = false;
    setBio(null);
    fetchBio(person).then(result => {
      if (!ignore) {
        setBio(result);
      }
    });
    return () => {
      ignore = true;
    };
  }, [person]);

  // ...
```

Note the `ignore` variable which is initialized to `false`, and is set to `true` during cleanup. This ensures [your code doesn't suffer from "race conditions":](https://maxrozen.com/race-conditions-fetching-data-react-with-useeffect) network responses may arrive in a different order than you sent them.

<Sandpack>

{/_ TODO(@poteto) - investigate potential false positives in react compiler validation _/}

```js {expectedErrors: {'react-compiler': [9]}} src/App.js
import { useState, useEffect } from 'react'
import { fetchBio } from './api.js'

export default function Page() {
  const [person, setPerson] = useState('Alice')
  const [bio, setBio] = useState(null)
  useEffect(() => {
    let ignore = false
    setBio(null)
    fetchBio(person).then((result) => {
      if (!ignore) {
        setBio(result)
      }
    })
    return () => {
      ignore = true
    }
  }, [person])

  return (
    <>
      <select
        value={person}
        onChange={(e) => {
          setPerson(e.target.value)
        }}
      >
        <option value="Alice">Alice</option>
        <option value="Bob">Bob</option>
        <option value="Taylor">Taylor</option>
      </select>
      <hr />
      <p>
        <i>{bio ?? 'Loading...'}</i>
      </p>
    </>
  )
}
```

```js src/api.js hidden
export async function fetchBio(person) {
  const delay = person === 'Bob' ? 2000 : 200
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve('This is ' + person + '’s bio.')
    }, delay)
  })
}
```

</Sandpack>

You can also rewrite using the [`async` / `await`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function) syntax, but you still need to provide a cleanup function:

<Sandpack>

```js src/App.js
import { useState, useEffect } from 'react'
import { fetchBio } from './api.js'

export default function Page() {
  const [person, setPerson] = useState('Alice')
  const [bio, setBio] = useState(null)
  useEffect(() => {
    async function startFetching() {
      setBio(null)
      const result = await fetchBio(person)
      if (!ignore) {
        setBio(result)
      }
    }

    let ignore = false
    startFetching()
    return () => {
      ignore = true
    }
  }, [person])

  return (
    <>
      <select
        value={person}
        onChange={(e) => {
          setPerson(e.target.value)
        }}
      >
        <option value="Alice">Alice</option>
        <option value="Bob">Bob</option>
        <option value="Taylor">Taylor</option>
      </select>
      <hr />
      <p>
        <i>{bio ?? 'Loading...'}</i>
      </p>
    </>
  )
}
```

```js src/api.js hidden
export async function fetchBio(person) {
  const delay = person === 'Bob' ? 2000 : 200
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve('This is ' + person + '’s bio.')
    }, delay)
  })
}
```

</Sandpack>

Writing data fetching directly in Effects gets repetitive and makes it difficult to add optimizations like caching and server rendering later. [It's easier to use a custom Hook--either your own or maintained by the community.](/learn/reusing-logic-with-custom-hooks#when-to-use-custom-hooks)

<DeepDive>

#### What are good alternatives to data fetching in Effects? {/_what-are-good-alternatives-to-data-fetching-in-effects_/}

Writing `fetch` calls inside Effects is a [popular way to fetch data](https://www.robinwieruch.de/react-hooks-fetch-data/), especially in fully client-side apps. This is, however, a very manual approach and it has significant downsides:

- **Effects don't run on the server.** This means that the initial server-rendered HTML will only include a loading state with no data. The client computer will have to download all JavaScript and render your app only to discover that now it needs to load the data. This is not very efficient.
- **Fetching directly in Effects makes it easy to create "network waterfalls".** You render the parent component, it fetches some data, renders the child components, and then they start fetching their data. If the network is not very fast, this is significantly slower than fetching all data in parallel.
- **Fetching directly in Effects usually means you don't preload or cache data.** For example, if the component unmounts and then mounts again, it would have to fetch the data again.
- **It's not very ergonomic.** There's quite a bit of boilerplate code involved when writing `fetch` calls in a way that doesn't suffer from bugs like [race conditions.](https://maxrozen.com/race-conditions-fetching-data-react-with-useeffect)

This list of downsides is not specific to React. It applies to fetching data on mount with any library. Like with routing, data fetching is not trivial to do well, so we recommend the following approaches:

- **If you use a [framework](/learn/creating-a-react-app#full-stack-frameworks), use its built-in data fetching mechanism.** Modern React frameworks have integrated data fetching mechanisms that are efficient and don't suffer from the above pitfalls.
- **Otherwise, consider using or building a client-side cache.** Popular open source solutions include [TanStack Query](https://tanstack.com/query/latest/), [useSWR](https://swr.vercel.app/), and [React Router 6.4+.](https://beta.reactrouter.com/en/main/start/overview) You can build your own solution too, in which case you would use Effects under the hood but also add logic for deduplicating requests, caching responses, and avoiding network waterfalls (by preloading data or hoisting data requirements to routes).

You can continue fetching data directly in Effects if neither of these approaches suit you.

</DeepDive>

---

### Specifying reactive dependencies {/_specifying-reactive-dependencies_/}

**Notice that you can't "choose" the dependencies of your Effect.** Every <CodeStep step={2}>reactive value</CodeStep> used by your Effect's code must be declared as a dependency. Your Effect's dependency list is determined by the surrounding code:

```js [[2, 1, "roomId"], [2, 2, "serverUrl"], [2, 5, "serverUrl"], [2, 5, "roomId"], [2, 8, "serverUrl"], [2, 8, "roomId"]]
function ChatRoom({ roomId }) {
  // This is a reactive value
  const [serverUrl, setServerUrl] = useState('https://localhost:1234') // This is a reactive value too

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId) // This Effect reads these reactive values
    connection.connect()
    return () => connection.disconnect()
  }, [serverUrl, roomId]) // ✅ So you must specify them as dependencies of your Effect
  // ...
}
```

If either `serverUrl` or `roomId` change, your Effect will reconnect to the chat using the new values.

**[Reactive values](/learn/lifecycle-of-reactive-effects#effects-react-to-reactive-values) include props and all variables and functions declared directly inside of your component.** Since `roomId` and `serverUrl` are reactive values, you can't remove them from the dependencies. If you try to omit them and [your linter is correctly configured for React,](/learn/editor-setup#linting) the linter will flag this as a mistake you need to fix:

```js {8}
function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234')

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => connection.disconnect()
  }, []) // 🔴 React Hook useEffect has missing dependencies: 'roomId' and 'serverUrl'
  // ...
}
```

**To remove a dependency, you need to ["prove" to the linter that it _doesn't need_ to be a dependency.](/learn/removing-effect-dependencies#removing-unnecessary-dependencies)** For example, you can move `serverUrl` out of your component to prove that it's not reactive and won't change on re-renders:

```js {1,8}
const serverUrl = 'https://localhost:1234' // Not a reactive value anymore

function ChatRoom({ roomId }) {
  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => connection.disconnect()
  }, [roomId]) // ✅ All dependencies declared
  // ...
}
```

Now that `serverUrl` is not a reactive value (and can't change on a re-render), it doesn't need to be a dependency. **If your Effect's code doesn't use any reactive values, its dependency list should be empty (`[]`):**

```js {1,2,9}
const serverUrl = 'https://localhost:1234' // Not a reactive value anymore
const roomId = 'music' // Not a reactive value anymore

function ChatRoom() {
  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => connection.disconnect()
  }, []) // ✅ All dependencies declared
  // ...
}
```

[An Effect with empty dependencies](/learn/lifecycle-of-reactive-effects#what-an-effect-with-empty-dependencies-means) doesn't re-run when any of your component's props or state change.

<Pitfall>

If you have an existing codebase, you might have some Effects that suppress the linter like this:

```js {3-4}
useEffect(() => {
  // ...
  // 🔴 Avoid suppressing the linter like this:
  // eslint-ignore-next-line react-hooks/exhaustive-deps
}, [])
```

**When dependencies don't match the code, there is a high risk of introducing bugs.** By suppressing the linter, you "lie" to React about the values your Effect depends on. [Instead, prove they're unnecessary.](/learn/removing-effect-dependencies#removing-unnecessary-dependencies)

</Pitfall>

<Recipes titleText="Examples of passing reactive dependencies" titleId="examples-dependencies">

#### Passing a dependency array {/_passing-a-dependency-array_/}

If you specify the dependencies, your Effect runs **after the initial commit _and_ after commits with changed dependencies.**

```js {3}
useEffect(() => {
  // ...
}, [a, b]) // Runs again if a or b are different
```

In the below example, `serverUrl` and `roomId` are [reactive values,](/learn/lifecycle-of-reactive-effects#effects-react-to-reactive-values) so they both must be specified as dependencies. As a result, selecting a different room in the dropdown or editing the server URL input causes the chat to re-connect. However, since `message` isn't used in the Effect (and so it isn't a dependency), editing the message doesn't re-connect to the chat.

<Sandpack>

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => {
      connection.disconnect()
    }
  }, [serverUrl, roomId])

  return (
    <>
      <label>
        Server URL:{' '}
        <input
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
        />
      </label>
      <h1>Welcome to the {roomId} room!</h1>
      <label>
        Your message:{' '}
        <input value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
    </>
  )
}

export default function App() {
  const [show, setShow] = useState(false)
  const [roomId, setRoomId] = useState('general')
  return (
    <>
      <label>
        Choose the chat room:{' '}
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="general">general</option>
          <option value="travel">travel</option>
          <option value="music">music</option>
        </select>
        <button onClick={() => setShow(!show)}>
          {show ? 'Close chat' : 'Open chat'}
        </button>
      </label>
      {show && <hr />}
      {show && <ChatRoom roomId={roomId} />}
    </>
  )
}
```

```js src/chat.js
export function createConnection(serverUrl, roomId) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
    },
  }
}
```

```css
input {
  margin-bottom: 10px;
}
button {
  margin-left: 5px;
}
```

</Sandpack>

<Solution />

#### Passing an empty dependency array {/_passing-an-empty-dependency-array_/}

If your Effect truly doesn't use any reactive values, it will only run **after the initial commit.**

```js {3}
useEffect(() => {
  // ...
}, []) // Does not run again (except once in development)
```

**Even with empty dependencies, setup and cleanup will [run one extra time in development](/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development) to help you find bugs.**

In this example, both `serverUrl` and `roomId` are hardcoded. Since they're declared outside the component, they are not reactive values, and so they aren't dependencies. The dependency list is empty, so the Effect doesn't re-run on re-renders.

<Sandpack>

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

const serverUrl = 'https://localhost:1234'
const roomId = 'music'

function ChatRoom() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => connection.disconnect()
  }, [])

  return (
    <>
      <h1>Welcome to the {roomId} room!</h1>
      <label>
        Your message:{' '}
        <input value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
    </>
  )
}

export default function App() {
  const [show, setShow] = useState(false)
  return (
    <>
      <button onClick={() => setShow(!show)}>
        {show ? 'Close chat' : 'Open chat'}
      </button>
      {show && <hr />}
      {show && <ChatRoom />}
    </>
  )
}
```

```js src/chat.js
export function createConnection(serverUrl, roomId) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
    },
  }
}
```

</Sandpack>

<Solution />

#### Passing no dependency array at all {/_passing-no-dependency-array-at-all_/}

If you pass no dependency array at all, your Effect runs **after every single commit** of your component.

```js {3}
useEffect(() => {
  // ...
}) // Always runs again
```

In this example, the Effect re-runs when you change `serverUrl` and `roomId`, which is sensible. However, it _also_ re-runs when you change the `message`, which is probably undesirable. This is why usually you'll specify the dependency array.

<Sandpack>

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

function ChatRoom({ roomId }) {
  const [serverUrl, setServerUrl] = useState('https://localhost:1234')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => {
      connection.disconnect()
    }
  }) // No dependency array at all

  return (
    <>
      <label>
        Server URL:{' '}
        <input
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
        />
      </label>
      <h1>Welcome to the {roomId} room!</h1>
      <label>
        Your message:{' '}
        <input value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
    </>
  )
}

export default function App() {
  const [show, setShow] = useState(false)
  const [roomId, setRoomId] = useState('general')
  return (
    <>
      <label>
        Choose the chat room:{' '}
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="general">general</option>
          <option value="travel">travel</option>
          <option value="music">music</option>
        </select>
        <button onClick={() => setShow(!show)}>
          {show ? 'Close chat' : 'Open chat'}
        </button>
      </label>
      {show && <hr />}
      {show && <ChatRoom roomId={roomId} />}
    </>
  )
}
```

```js src/chat.js
export function createConnection(serverUrl, roomId) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
    },
  }
}
```

```css
input {
  margin-bottom: 10px;
}
button {
  margin-left: 5px;
}
```

</Sandpack>

<Solution />

</Recipes>

---

### Updating state based on previous state from an Effect {/_updating-state-based-on-previous-state-from-an-effect_/}

When you want to update state based on previous state from an Effect, you might run into a problem:

```js {6,9}
function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCount(count + 1) // You want to increment the counter every second...
    }, 1000)
    return () => clearInterval(intervalId)
  }, [count]) // 🚩 ... but specifying `count` as a dependency always resets the interval.
  // ...
}
```

Since `count` is a reactive value, it must be specified in the list of dependencies. However, that causes the Effect to cleanup and setup again every time the `count` changes. This is not ideal.

To fix this, [pass the `c => c + 1` state updater](/reference/react/useState#updating-state-based-on-the-previous-state) to `setCount`:

<Sandpack>

```js
import { useState, useEffect } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCount((c) => c + 1) // ✅ Pass a state updater
    }, 1000)
    return () => clearInterval(intervalId)
  }, []) // ✅ Now count is not a dependency

  return <h1>{count}</h1>
}
```

```css
label {
  display: block;
  margin-top: 20px;
  margin-bottom: 20px;
}

body {
  min-height: 150px;
}
```

</Sandpack>

Now that you're passing `c => c + 1` instead of `count + 1`, [your Effect no longer needs to depend on `count`.](/learn/removing-effect-dependencies#are-you-reading-some-state-to-calculate-the-next-state) As a result of this fix, it won't need to cleanup and setup the interval again every time the `count` changes.

---

### Removing unnecessary object dependencies {/_removing-unnecessary-object-dependencies_/}

If your Effect depends on an object or a function created during rendering, it might run too often. For example, this Effect re-connects after every commit because the `options` object is [different for every render:](/learn/removing-effect-dependencies#does-some-reactive-value-change-unintentionally)

```js {6-9,12,15}
const serverUrl = 'https://localhost:1234';

function ChatRoom({ roomId }) {
  const [message, setMessage] = useState('');

  const options = { // 🚩 This object is created from scratch on every re-render
    serverUrl: serverUrl,
    roomId: roomId
  };

  useEffect(() => {
    const connection = createConnection(options); // It's used inside the Effect
    connection.connect();
    return () => connection.disconnect();
  }, [options]); // 🚩 As a result, these dependencies are always different on a commit
  // ...
```

Avoid using an object created during rendering as a dependency. Instead, create the object inside the Effect:

<Sandpack>

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

const serverUrl = 'https://localhost:1234'

function ChatRoom({ roomId }) {
  const [message, setMessage] = useState('')

  useEffect(() => {
    const options = {
      serverUrl: serverUrl,
      roomId: roomId,
    }
    const connection = createConnection(options)
    connection.connect()
    return () => connection.disconnect()
  }, [roomId])

  return (
    <>
      <h1>Welcome to the {roomId} room!</h1>
      <input value={message} onChange={(e) => setMessage(e.target.value)} />
    </>
  )
}

export default function App() {
  const [roomId, setRoomId] = useState('general')
  return (
    <>
      <label>
        Choose the chat room:{' '}
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="general">general</option>
          <option value="travel">travel</option>
          <option value="music">music</option>
        </select>
      </label>
      <hr />
      <ChatRoom roomId={roomId} />
    </>
  )
}
```

```js src/chat.js
export function createConnection({ serverUrl, roomId }) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
    },
  }
}
```

```css
input {
  display: block;
  margin-bottom: 20px;
}
button {
  margin-left: 10px;
}
```

</Sandpack>

Now that you create the `options` object inside the Effect, the Effect itself only depends on the `roomId` string.

With this fix, typing into the input doesn't reconnect the chat. Unlike an object which gets re-created, a string like `roomId` doesn't change unless you set it to another value. [Read more about removing dependencies.](/learn/removing-effect-dependencies)

---

### Removing unnecessary function dependencies {/_removing-unnecessary-function-dependencies_/}

If your Effect depends on an object or a function created during rendering, it might run too often. For example, this Effect re-connects after every commit because the `createOptions` function is [different for every render:](/learn/removing-effect-dependencies#does-some-reactive-value-change-unintentionally)

```js {4-9,12,16}
function ChatRoom({ roomId }) {
  const [message, setMessage] = useState('');

  function createOptions() { // 🚩 This function is created from scratch on every re-render
    return {
      serverUrl: serverUrl,
      roomId: roomId
    };
  }

  useEffect(() => {
    const options = createOptions(); // It's used inside the Effect
    const connection = createConnection();
    connection.connect();
    return () => connection.disconnect();
  }, [createOptions]); // 🚩 As a result, these dependencies are always different on a commit
  // ...
```

By itself, creating a function from scratch on every re-render is not a problem. You don't need to optimize that. However, if you use it as a dependency of your Effect, it will cause your Effect to re-run after every commit.

Avoid using a function created during rendering as a dependency. Instead, declare it inside the Effect:

<Sandpack>

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

const serverUrl = 'https://localhost:1234'

function ChatRoom({ roomId }) {
  const [message, setMessage] = useState('')

  useEffect(() => {
    function createOptions() {
      return {
        serverUrl: serverUrl,
        roomId: roomId,
      }
    }

    const options = createOptions()
    const connection = createConnection(options)
    connection.connect()
    return () => connection.disconnect()
  }, [roomId])

  return (
    <>
      <h1>Welcome to the {roomId} room!</h1>
      <input value={message} onChange={(e) => setMessage(e.target.value)} />
    </>
  )
}

export default function App() {
  const [roomId, setRoomId] = useState('general')
  return (
    <>
      <label>
        Choose the chat room:{' '}
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="general">general</option>
          <option value="travel">travel</option>
          <option value="music">music</option>
        </select>
      </label>
      <hr />
      <ChatRoom roomId={roomId} />
    </>
  )
}
```

```js src/chat.js
export function createConnection({ serverUrl, roomId }) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
    },
  }
}
```

```css
input {
  display: block;
  margin-bottom: 20px;
}
button {
  margin-left: 10px;
}
```

</Sandpack>

Now that you define the `createOptions` function inside the Effect, the Effect itself only depends on the `roomId` string. With this fix, typing into the input doesn't reconnect the chat. Unlike a function which gets re-created, a string like `roomId` doesn't change unless you set it to another value. [Read more about removing dependencies.](/learn/removing-effect-dependencies)

---

### Reading the latest props and state from an Effect {/_reading-the-latest-props-and-state-from-an-effect_/}

By default, when you read a reactive value from an Effect, you have to add it as a dependency. This ensures that your Effect "reacts" to every change of that value. For most dependencies, that's the behavior you want.

**However, sometimes you'll want to read the _latest_ props and state from an Effect without "reacting" to them.** For example, imagine you want to log the number of the items in the shopping cart for every page visit:

```js {3}
function Page({ url, shoppingCart }) {
  useEffect(() => {
    logVisit(url, shoppingCart.length)
  }, [url, shoppingCart]) // ✅ All dependencies declared
  // ...
}
```

**What if you want to log a new page visit after every `url` change, but _not_ if only the `shoppingCart` changes?** You can't exclude `shoppingCart` from dependencies without breaking the [reactivity rules.](#specifying-reactive-dependencies) However, you can express that you _don't want_ a piece of code to "react" to changes even though it is called from inside an Effect. [Declare an _Effect Event_](/learn/separating-events-from-effects#declaring-an-effect-event) with the [`useEffectEvent`](/reference/react/useEffectEvent) Hook, and move the code reading `shoppingCart` inside of it:

```js {2-4,7,8}
function Page({ url, shoppingCart }) {
  const onVisit = useEffectEvent((visitedUrl) => {
    logVisit(visitedUrl, shoppingCart.length)
  })

  useEffect(() => {
    onVisit(url)
  }, [url]) // ✅ All dependencies declared
  // ...
}
```

**Effect Events are not reactive and must always be omitted from dependencies of your Effect.** This is what lets you put non-reactive code (where you can read the latest value of some props and state) inside of them. By reading `shoppingCart` inside of `onVisit`, you ensure that `shoppingCart` won't re-run your Effect.

[Read more about how Effect Events let you separate reactive and non-reactive code.](/learn/separating-events-from-effects#reading-latest-props-and-state-with-effect-events)

---

### Displaying different content on the server and the client {/_displaying-different-content-on-the-server-and-the-client_/}

If your app uses server rendering (either [directly](/reference/react-dom/server) or via a [framework](/learn/creating-a-react-app#full-stack-frameworks)), your component will render in two different environments. On the server, it will render to produce the initial HTML. On the client, React will run the rendering code again so that it can attach your event handlers to that HTML. This is why, for [hydration](/reference/react-dom/client/hydrateRoot#hydrating-server-rendered-html) to work, your initial render output must be identical on the client and the server.

In rare cases, you might need to display different content on the client. For example, if your app reads some data from [`localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage), it can't possibly do that on the server. Here is how you could implement this:

{/_ TODO(@poteto) - investigate potential false positives in react compiler validation _/}

```js {expectedErrors: {'react-compiler': [5]}}
function MyComponent() {
  const [didMount, setDidMount] = useState(false)

  useEffect(() => {
    setDidMount(true)
  }, [])

  if (didMount) {
    // ... return client-only JSX ...
  } else {
    // ... return initial JSX ...
  }
}
```

While the app is loading, the user will see the initial render output. Then, when it's loaded and hydrated, your Effect will run and set `didMount` to `true`, triggering a re-render. This will switch to the client-only render output. Effects don't run on the server, so this is why `didMount` was `false` during the initial server render.

Use this pattern sparingly. Keep in mind that users with a slow connection will see the initial content for quite a bit of time--potentially, many seconds--so you don't want to make jarring changes to your component's appearance. In many cases, you can avoid the need for this by conditionally showing different things with CSS.

---

## Troubleshooting {/_troubleshooting_/}

### My Effect runs twice when the component mounts {/_my-effect-runs-twice-when-the-component-mounts_/}

When Strict Mode is on, in development, React runs setup and cleanup one extra time before the actual setup.

This is a stress-test that verifies your Effect’s logic is implemented correctly. If this causes visible issues, your cleanup function is missing some logic. The cleanup function should stop or undo whatever the setup function was doing. The rule of thumb is that the user shouldn’t be able to distinguish between the setup being called once (as in production) and a setup → cleanup → setup sequence (as in development).

Read more about [how this helps find bugs](/learn/synchronizing-with-effects#step-3-add-cleanup-if-needed) and [how to fix your logic.](/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development)

---

### My Effect runs after every re-render {/_my-effect-runs-after-every-re-render_/}

First, check that you haven't forgotten to specify the dependency array:

```js {3}
useEffect(() => {
  // ...
}) // 🚩 No dependency array: re-runs after every commit!
```

If you've specified the dependency array but your Effect still re-runs in a loop, it's because one of your dependencies is different on every re-render.

You can debug this problem by manually logging your dependencies to the console:

```js {5}
useEffect(() => {
  // ..
}, [serverUrl, roomId])

console.log([serverUrl, roomId])
```

You can then right-click on the arrays from different re-renders in the console and select "Store as a global variable" for both of them. Assuming the first one got saved as `temp1` and the second one got saved as `temp2`, you can then use the browser console to check whether each dependency in both arrays is the same:

```js
Object.is(temp1[0], temp2[0]) // Is the first dependency the same between the arrays?
Object.is(temp1[1], temp2[1]) // Is the second dependency the same between the arrays?
Object.is(temp1[2], temp2[2]) // ... and so on for every dependency ...
```

When you find the dependency that is different on every re-render, you can usually fix it in one of these ways:

- [Updating state based on previous state from an Effect](#updating-state-based-on-previous-state-from-an-effect)
- [Removing unnecessary object dependencies](#removing-unnecessary-object-dependencies)
- [Removing unnecessary function dependencies](#removing-unnecessary-function-dependencies)
- [Reading the latest props and state from an Effect](#reading-the-latest-props-and-state-from-an-effect)

As a last resort (if these methods didn't help), wrap its creation with [`useMemo`](/reference/react/useMemo#memoizing-a-dependency-of-another-hook) or [`useCallback`](/reference/react/useCallback#preventing-an-effect-from-firing-too-often) (for functions).

---

### My Effect keeps re-running in an infinite cycle {/_my-effect-keeps-re-running-in-an-infinite-cycle_/}

If your Effect runs in an infinite cycle, these two things must be true:

- Your Effect is updating some state.
- That state leads to a re-render, which causes the Effect's dependencies to change.

Before you start fixing the problem, ask yourself whether your Effect is connecting to some external system (like DOM, network, a third-party widget, and so on). Why does your Effect need to set state? Does it synchronize with that external system? Or are you trying to manage your application's data flow with it?

If there is no external system, consider whether [removing the Effect altogether](/learn/you-might-not-need-an-effect) would simplify your logic.

If you're genuinely synchronizing with some external system, think about why and under what conditions your Effect should update the state. Has something changed that affects your component's visual output? If you need to keep track of some data that isn't used by rendering, a [ref](/reference/react/useRef#referencing-a-value-with-a-ref) (which doesn't trigger re-renders) might be more appropriate. Verify your Effect doesn't update the state (and trigger re-renders) more than needed.

Finally, if your Effect is updating the state at the right time, but there is still a loop, it's because that state update leads to one of the Effect's dependencies changing. [Read how to debug dependency changes.](/reference/react/useEffect#my-effect-runs-after-every-re-render)

---

### My cleanup logic runs even though my component didn't unmount {/_my-cleanup-logic-runs-even-though-my-component-didnt-unmount_/}

The cleanup function runs not only during unmount, but before every re-render with changed dependencies. Additionally, in development, React [runs setup+cleanup one extra time immediately after component mounts.](#my-effect-runs-twice-when-the-component-mounts)

If you have cleanup code without corresponding setup code, it's usually a code smell:

```js {2-5}
useEffect(() => {
  // 🔴 Avoid: Cleanup logic without corresponding setup logic
  return () => {
    doSomething()
  }
}, [])
```

Your cleanup logic should be "symmetrical" to the setup logic, and should stop or undo whatever setup did:

```js {2-3,5}
useEffect(() => {
  const connection = createConnection(serverUrl, roomId)
  connection.connect()
  return () => {
    connection.disconnect()
  }
}, [serverUrl, roomId])
```

[Learn how the Effect lifecycle is different from the component's lifecycle.](/learn/lifecycle-of-reactive-effects#the-lifecycle-of-an-effect)

---

### My Effect does something visual, and I see a flicker before it runs {/_my-effect-does-something-visual-and-i-see-a-flicker-before-it-runs_/}

If your Effect must block the browser from [painting the screen,](/learn/render-and-commit#epilogue-browser-paint) replace `useEffect` with [`useLayoutEffect`](/reference/react/useLayoutEffect). Note that **this shouldn't be needed for the vast majority of Effects.** You'll only need this if it's crucial to run your Effect before the browser paint: for example, to measure and position a tooltip before the user sees it.
