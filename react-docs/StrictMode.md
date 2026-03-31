---
title: <StrictMode>
---

<Intro>

`<StrictMode>` lets you find common bugs in your components early during development.

```js
<StrictMode>
  <App />
</StrictMode>
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `<StrictMode>` {/_strictmode_/}

Use `StrictMode` to enable additional development behaviors and warnings for the component tree inside:

```js
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = createRoot(document.getElementById('root'))
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

[See more examples below.](#usage)

Strict Mode enables the following development-only behaviors:

- Your components will [re-render an extra time](#fixing-bugs-found-by-double-rendering-in-development) to find bugs caused by impure rendering.
- Your components will [re-run Effects an extra time](#fixing-bugs-found-by-re-running-effects-in-development) to find bugs caused by missing Effect cleanup.
- Your components will [re-run refs callbacks an extra time](#fixing-bugs-found-by-re-running-ref-callbacks-in-development) to find bugs caused by missing ref cleanup.
- Your components will [be checked for usage of deprecated APIs.](#fixing-deprecation-warnings-enabled-by-strict-mode)

#### Props {/_props_/}

`StrictMode` accepts no props.

#### Caveats {/_caveats_/}

- There is no way to opt out of Strict Mode inside a tree wrapped in `<StrictMode>`. This gives you confidence that all components inside `<StrictMode>` are checked. If two teams working on a product disagree whether they find the checks valuable, they need to either reach consensus or move `<StrictMode>` down in the tree.

---

## Usage {/_usage_/}

### Enabling Strict Mode for entire app {/_enabling-strict-mode-for-entire-app_/}

Strict Mode enables extra development-only checks for the entire component tree inside the `<StrictMode>` component. These checks help you find common bugs in your components early in the development process.

To enable Strict Mode for your entire app, wrap your root component with `<StrictMode>` when you render it:

```js {6,8}
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = createRoot(document.getElementById('root'))
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

We recommend wrapping your entire app in Strict Mode, especially for newly created apps. If you use a framework that calls [`createRoot`](/reference/react-dom/client/createRoot) for you, check its documentation for how to enable Strict Mode.

Although the Strict Mode checks **only run in development,** they help you find bugs that already exist in your code but can be tricky to reliably reproduce in production. Strict Mode lets you fix bugs before your users report them.

<Note>

Strict Mode enables the following checks in development:

- Your components will [re-render an extra time](#fixing-bugs-found-by-double-rendering-in-development) to find bugs caused by impure rendering.
- Your components will [re-run Effects an extra time](#fixing-bugs-found-by-re-running-effects-in-development) to find bugs caused by missing Effect cleanup.
- Your components will [re-run ref callbacks an extra time](#fixing-bugs-found-by-re-running-ref-callbacks-in-development) to find bugs caused by missing ref cleanup.
- Your components will [be checked for usage of deprecated APIs.](#fixing-deprecation-warnings-enabled-by-strict-mode)

**All of these checks are development-only and do not impact the production build.**

</Note>

---

### Enabling Strict Mode for a part of the app {/_enabling-strict-mode-for-a-part-of-the-app_/}

You can also enable Strict Mode for any part of your application:

```js {7,12}
import { StrictMode } from 'react'

function App() {
  return (
    <>
      <Header />
      <StrictMode>
        <main>
          <Sidebar />
          <Content />
        </main>
      </StrictMode>
      <Footer />
    </>
  )
}
```

In this example, Strict Mode checks will not run against the `Header` and `Footer` components. However, they will run on `Sidebar` and `Content`, as well as all of the components inside them, no matter how deep.

<Note>

When `StrictMode` is enabled for a part of the app, React will only enable behaviors that are possible in production. For example, if `<StrictMode>` is not enabled at the root of the app, it will not [re-run Effects an extra time](#fixing-bugs-found-by-re-running-effects-in-development) on initial mount, since this would cause child effects to double fire without the parent effects, which cannot happen in production.

</Note>

---

### Fixing bugs found by double rendering in development {/_fixing-bugs-found-by-double-rendering-in-development_/}

[React assumes that every component you write is a pure function.](/learn/keeping-components-pure) This means that React components you write must always return the same JSX given the same inputs (props, state, and context).

Components breaking this rule behave unpredictably and cause bugs. To help you find accidentally impure code, Strict Mode calls some of your functions (only the ones that should be pure) **twice in development.** This includes:

- Your component function body (only top-level logic, so this doesn't include code inside event handlers)
- Functions that you pass to [`useState`](/reference/react/useState), [`set` functions](/reference/react/useState#setstate), [`useMemo`](/reference/react/useMemo), or [`useReducer`](/reference/react/useReducer)
- Some class component methods like [`constructor`](/reference/react/Component#constructor), [`render`](/reference/react/Component#render), [`shouldComponentUpdate`](/reference/react/Component#shouldcomponentupdate) ([see the whole list](https://reactjs.org/docs/strict-mode.html#detecting-unexpected-side-effects))

If a function is pure, running it twice does not change its behavior because a pure function produces the same result every time. However, if a function is impure (for example, it mutates the data it receives), running it twice tends to be noticeable (that's what makes it impure!) This helps you spot and fix the bug early.

**Here is an example to illustrate how double rendering in Strict Mode helps you find bugs early.**

This `StoryTray` component takes an array of `stories` and adds one last "Create Story" item at the end:

<Sandpack>

```js src/index.js
import { createRoot } from 'react-dom/client'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
root.render(<App />)
```

```js src/App.js
import { useState } from 'react'
import StoryTray from './StoryTray.js'

let initialStories = [
  { id: 0, label: "Ankit's Story" },
  { id: 1, label: "Taylor's Story" },
]

export default function App() {
  let [stories, setStories] = useState(initialStories)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        textAlign: 'center',
      }}
    >
      <StoryTray stories={stories} />
    </div>
  )
}
```

```js src/StoryTray.js active
export default function StoryTray({ stories }) {
  const items = stories
  items.push({ id: 'create', label: 'Create Story' })
  return (
    <ul>
      {items.map((story) => (
        <li key={story.id}>{story.label}</li>
      ))}
    </ul>
  )
}
```

```css
ul {
  margin: 0;
  list-style-type: none;
  height: 100%;
  display: flex;
  flex-wrap: wrap;
  padding: 10px;
}

li {
  border: 1px solid #aaa;
  border-radius: 6px;
  float: left;
  margin: 5px;
  padding: 5px;
  width: 70px;
  height: 100px;
}
```

</Sandpack>

There is a mistake in the code above. However, it is easy to miss because the initial output appears correct.

This mistake will become more noticeable if the `StoryTray` component re-renders multiple times. For example, let's make the `StoryTray` re-render with a different background color whenever you hover over it:

<Sandpack>

```js src/index.js
import { createRoot } from 'react-dom/client'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
root.render(<App />)
```

```js src/App.js
import { useState } from 'react'
import StoryTray from './StoryTray.js'

let initialStories = [
  { id: 0, label: "Ankit's Story" },
  { id: 1, label: "Taylor's Story" },
]

export default function App() {
  let [stories, setStories] = useState(initialStories)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        textAlign: 'center',
      }}
    >
      <StoryTray stories={stories} />
    </div>
  )
}
```

```js src/StoryTray.js active
import { useState } from 'react'

export default function StoryTray({ stories }) {
  const [isHover, setIsHover] = useState(false)
  const items = stories
  items.push({ id: 'create', label: 'Create Story' })
  return (
    <ul
      onPointerEnter={() => setIsHover(true)}
      onPointerLeave={() => setIsHover(false)}
      style={{
        backgroundColor: isHover ? '#ddd' : '#fff',
      }}
    >
      {items.map((story) => (
        <li key={story.id}>{story.label}</li>
      ))}
    </ul>
  )
}
```

```css
ul {
  margin: 0;
  list-style-type: none;
  height: 100%;
  display: flex;
  flex-wrap: wrap;
  padding: 10px;
}

li {
  border: 1px solid #aaa;
  border-radius: 6px;
  float: left;
  margin: 5px;
  padding: 5px;
  width: 70px;
  height: 100px;
}
```

</Sandpack>

Notice how every time you hover over the `StoryTray` component, "Create Story" gets added to the list again. The intention of the code was to add it once at the end. But `StoryTray` directly modifies the `stories` array from the props. Every time `StoryTray` renders, it adds "Create Story" again at the end of the same array. In other words, `StoryTray` is not a pure function--running it multiple times produces different results.

To fix this problem, you can make a copy of the array, and modify that copy instead of the original one:

```js {2}
export default function StoryTray({ stories }) {
  const items = stories.slice(); // Clone the array
  // ✅ Good: Pushing into a new array
  items.push({ id: 'create', label: 'Create Story' });
```

This would [make the `StoryTray` function pure.](/learn/keeping-components-pure) Each time it is called, it would only modify a new copy of the array, and would not affect any external objects or variables. This solves the bug, but you had to make the component re-render more often before it became obvious that something is wrong with its behavior.

**In the original example, the bug wasn't obvious. Now let's wrap the original (buggy) code in `<StrictMode>`:**

<Sandpack>

```js src/index.js
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

```js src/App.js
import { useState } from 'react'
import StoryTray from './StoryTray.js'

let initialStories = [
  { id: 0, label: "Ankit's Story" },
  { id: 1, label: "Taylor's Story" },
]

export default function App() {
  let [stories, setStories] = useState(initialStories)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        textAlign: 'center',
      }}
    >
      <StoryTray stories={stories} />
    </div>
  )
}
```

```js src/StoryTray.js active
export default function StoryTray({ stories }) {
  const items = stories
  items.push({ id: 'create', label: 'Create Story' })
  return (
    <ul>
      {items.map((story) => (
        <li key={story.id}>{story.label}</li>
      ))}
    </ul>
  )
}
```

```css
ul {
  margin: 0;
  list-style-type: none;
  height: 100%;
  display: flex;
  flex-wrap: wrap;
  padding: 10px;
}

li {
  border: 1px solid #aaa;
  border-radius: 6px;
  float: left;
  margin: 5px;
  padding: 5px;
  width: 70px;
  height: 100px;
}
```

</Sandpack>

**Strict Mode _always_ calls your rendering function twice, so you can see the mistake right away** ("Create Story" appears twice). This lets you notice such mistakes early in the process. When you fix your component to render in Strict Mode, you _also_ fix many possible future production bugs like the hover functionality from before:

<Sandpack>

```js src/index.js
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

```js src/App.js
import { useState } from 'react'
import StoryTray from './StoryTray.js'

let initialStories = [
  { id: 0, label: "Ankit's Story" },
  { id: 1, label: "Taylor's Story" },
]

export default function App() {
  let [stories, setStories] = useState(initialStories)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        textAlign: 'center',
      }}
    >
      <StoryTray stories={stories} />
    </div>
  )
}
```

```js src/StoryTray.js active
import { useState } from 'react'

export default function StoryTray({ stories }) {
  const [isHover, setIsHover] = useState(false)
  const items = stories.slice() // Clone the array
  items.push({ id: 'create', label: 'Create Story' })
  return (
    <ul
      onPointerEnter={() => setIsHover(true)}
      onPointerLeave={() => setIsHover(false)}
      style={{
        backgroundColor: isHover ? '#ddd' : '#fff',
      }}
    >
      {items.map((story) => (
        <li key={story.id}>{story.label}</li>
      ))}
    </ul>
  )
}
```

```css
ul {
  margin: 0;
  list-style-type: none;
  height: 100%;
  display: flex;
  flex-wrap: wrap;
  padding: 10px;
}

li {
  border: 1px solid #aaa;
  border-radius: 6px;
  float: left;
  margin: 5px;
  padding: 5px;
  width: 70px;
  height: 100px;
}
```

</Sandpack>

Without Strict Mode, it was easy to miss the bug until you added more re-renders. Strict Mode made the same bug appear right away. Strict Mode helps you find bugs before you push them to your team and to your users.

[Read more about keeping components pure.](/learn/keeping-components-pure)

<Note>

If you have [React DevTools](/learn/react-developer-tools) installed, any `console.log` calls during the second render call will appear slightly dimmed. React DevTools also offers a setting (off by default) to suppress them completely.

</Note>

---

### Fixing bugs found by re-running Effects in development {/_fixing-bugs-found-by-re-running-effects-in-development_/}

Strict Mode can also help find bugs in [Effects.](/learn/synchronizing-with-effects)

Every Effect has some setup code and may have some cleanup code. Normally, React calls setup when the component _mounts_ (is added to the screen) and calls cleanup when the component _unmounts_ (is removed from the screen). React then calls cleanup and setup again if its dependencies changed since the last render.

When Strict Mode is on, React will also run **one extra setup+cleanup cycle in development for every Effect.** This may feel surprising, but it helps reveal subtle bugs that are hard to catch manually.

**Here is an example to illustrate how re-running Effects in Strict Mode helps you find bugs early.**

Consider this example that connects a component to a chat:

<Sandpack>

```js src/index.js
import { createRoot } from 'react-dom/client'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
root.render(<App />)
```

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

const serverUrl = 'https://localhost:1234'
const roomId = 'general'

export default function ChatRoom() {
  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
  }, [])
  return <h1>Welcome to the {roomId} room!</h1>
}
```

```js src/chat.js
let connections = 0

export function createConnection(serverUrl, roomId) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
      connections++
      console.log('Active connections: ' + connections)
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
      connections--
      console.log('Active connections: ' + connections)
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

There is an issue with this code, but it might not be immediately clear.

To make the issue more obvious, let's implement a feature. In the example below, `roomId` is not hardcoded. Instead, the user can select the `roomId` that they want to connect to from a dropdown. Click "Open chat" and then select different chat rooms one by one. Keep track of the number of active connections in the console:

<Sandpack>

```js src/index.js
import { createRoot } from 'react-dom/client'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
root.render(<App />)
```

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

const serverUrl = 'https://localhost:1234'

function ChatRoom({ roomId }) {
  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
  }, [roomId])

  return <h1>Welcome to the {roomId} room!</h1>
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
let connections = 0

export function createConnection(serverUrl, roomId) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
      connections++
      console.log('Active connections: ' + connections)
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
      connections--
      console.log('Active connections: ' + connections)
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

You'll notice that the number of open connections always keeps growing. In a real app, this would cause performance and network problems. The issue is that [your Effect is missing a cleanup function:](/learn/synchronizing-with-effects#step-3-add-cleanup-if-needed)

```js {4}
useEffect(() => {
  const connection = createConnection(serverUrl, roomId)
  connection.connect()
  return () => connection.disconnect()
}, [roomId])
```

Now that your Effect "cleans up" after itself and destroys the outdated connections, the leak is solved. However, notice that the problem did not become visible until you've added more features (the select box).

**In the original example, the bug wasn't obvious. Now let's wrap the original (buggy) code in `<StrictMode>`:**

<Sandpack>

```js src/index.js
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

const serverUrl = 'https://localhost:1234'
const roomId = 'general'

export default function ChatRoom() {
  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
  }, [])
  return <h1>Welcome to the {roomId} room!</h1>
}
```

```js src/chat.js
let connections = 0

export function createConnection(serverUrl, roomId) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
      connections++
      console.log('Active connections: ' + connections)
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
      connections--
      console.log('Active connections: ' + connections)
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

**With Strict Mode, you immediately see that there is a problem** (the number of active connections jumps to 2). Strict Mode runs an extra setup+cleanup cycle for every Effect. This Effect has no cleanup logic, so it creates an extra connection but doesn't destroy it. This is a hint that you're missing a cleanup function.

Strict Mode lets you notice such mistakes early in the process. When you fix your Effect by adding a cleanup function in Strict Mode, you _also_ fix many possible future production bugs like the select box from before:

<Sandpack>

```js src/index.js
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

```js
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

const serverUrl = 'https://localhost:1234'

function ChatRoom({ roomId }) {
  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.connect()
    return () => connection.disconnect()
  }, [roomId])

  return <h1>Welcome to the {roomId} room!</h1>
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
let connections = 0

export function createConnection(serverUrl, roomId) {
  // A real implementation would actually connect to the server
  return {
    connect() {
      console.log(
        '✅ Connecting to "' + roomId + '" room at ' + serverUrl + '...'
      )
      connections++
      console.log('Active connections: ' + connections)
    },
    disconnect() {
      console.log('❌ Disconnected from "' + roomId + '" room at ' + serverUrl)
      connections--
      console.log('Active connections: ' + connections)
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

Notice how the active connection count in the console doesn't keep growing anymore.

Without Strict Mode, it was easy to miss that your Effect needed cleanup. By running _setup → cleanup → setup_ instead of _setup_ for your Effect in development, Strict Mode made the missing cleanup logic more noticeable.

[Read more about implementing Effect cleanup.](/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development)

---

### Fixing bugs found by re-running ref callbacks in development {/_fixing-bugs-found-by-re-running-ref-callbacks-in-development_/}

Strict Mode can also help find bugs in [callbacks refs.](/learn/manipulating-the-dom-with-refs)

Every callback `ref` has some setup code and may have some cleanup code. Normally, React calls setup when the element is _created_ (is added to the DOM) and calls cleanup when the element is _removed_ (is removed from the DOM).

When Strict Mode is on, React will also run **one extra setup+cleanup cycle in development for every callback `ref`.** This may feel surprising, but it helps reveal subtle bugs that are hard to catch manually.

Consider this example, which allows you to select an animal and then scroll to one of them. Notice when you switch from "Cats" to "Dogs", the console logs show that the number of animals in the list keeps growing, and the "Scroll to" buttons stop working:

<Sandpack>

```js src/index.js
import { createRoot } from 'react-dom/client'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
// ❌ Not using StrictMode.
root.render(<App />)
```

```js src/App.js active
import { useRef, useState } from 'react'

export default function CatFriends() {
  const itemsRef = useRef([])
  const [catList, setCatList] = useState(setupCatList)
  const [cat, setCat] = useState('neo')

  function scrollToCat(index) {
    const list = itemsRef.current
    const { node } = list[index]
    node.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }

  const cats = catList.filter((c) => c.type === cat)

  return (
    <>
      <nav>
        <button onClick={() => setCat('neo')}>Neo</button>
        <button onClick={() => setCat('millie')}>Millie</button>
      </nav>
      <hr />
      <nav>
        <span>Scroll to:</span>
        {cats.map((cat, index) => (
          <button key={cat.src} onClick={() => scrollToCat(index)}>
            {index}
          </button>
        ))}
      </nav>
      <div>
        <ul>
          {cats.map((cat) => (
            <li
              key={cat.src}
              ref={(node) => {
                const list = itemsRef.current
                const item = { cat: cat, node }
                list.push(item)
                console.log(
                  `✅ Adding cat to the map. Total cats: ${list.length}`
                )
                if (list.length > 10) {
                  console.log('❌ Too many cats in the list!')
                }
                return () => {
                  // 🚩 No cleanup, this is a bug!
                }
              }}
            >
              <img src={cat.src} />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function setupCatList() {
  const catList = []
  for (let i = 0; i < 10; i++) {
    catList.push({ type: 'neo', src: 'https://placecats.com/neo/320/240?' + i })
  }
  for (let i = 0; i < 10; i++) {
    catList.push({
      type: 'millie',
      src: 'https://placecats.com/millie/320/240?' + i,
    })
  }

  return catList
}
```

```css
div {
  width: 100%;
  overflow: hidden;
}

nav {
  text-align: center;
}

button {
  margin: 0.25rem;
}

ul,
li {
  list-style: none;
  white-space: nowrap;
}

li {
  display: inline;
  padding: 0.5rem;
}
```

</Sandpack>

**This is a production bug!** Since the ref callback doesn't remove animals from the list in the cleanup, the list of animals keeps growing. This is a memory leak that can cause performance problems in a real app, and breaks the behavior of the app.

The issue is the ref callback doesn't cleanup after itself:

```js {6-8}
<li
  ref={node => {
    const list = itemsRef.current;
    const item = {animal, node};
    list.push(item);
    return () => {
      // 🚩 No cleanup, this is a bug!
    }
  }}
</li>
```

Now let's wrap the original (buggy) code in `<StrictMode>`:

<Sandpack>

```js src/index.js
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
// ✅ Using StrictMode.
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

```js src/App.js active
import { useRef, useState } from 'react'

export default function CatFriends() {
  const itemsRef = useRef([])
  const [catList, setCatList] = useState(setupCatList)
  const [cat, setCat] = useState('neo')

  function scrollToCat(index) {
    const list = itemsRef.current
    const { node } = list[index]
    node.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }

  const cats = catList.filter((c) => c.type === cat)

  return (
    <>
      <nav>
        <button onClick={() => setCat('neo')}>Neo</button>
        <button onClick={() => setCat('millie')}>Millie</button>
      </nav>
      <hr />
      <nav>
        <span>Scroll to:</span>
        {cats.map((cat, index) => (
          <button key={cat.src} onClick={() => scrollToCat(index)}>
            {index}
          </button>
        ))}
      </nav>
      <div>
        <ul>
          {cats.map((cat) => (
            <li
              key={cat.src}
              ref={(node) => {
                const list = itemsRef.current
                const item = { cat: cat, node }
                list.push(item)
                console.log(
                  `✅ Adding cat to the map. Total cats: ${list.length}`
                )
                if (list.length > 10) {
                  console.log('❌ Too many cats in the list!')
                }
                return () => {
                  // 🚩 No cleanup, this is a bug!
                }
              }}
            >
              <img src={cat.src} />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function setupCatList() {
  const catList = []
  for (let i = 0; i < 10; i++) {
    catList.push({ type: 'neo', src: 'https://placecats.com/neo/320/240?' + i })
  }
  for (let i = 0; i < 10; i++) {
    catList.push({
      type: 'millie',
      src: 'https://placecats.com/millie/320/240?' + i,
    })
  }

  return catList
}
```

```css
div {
  width: 100%;
  overflow: hidden;
}

nav {
  text-align: center;
}

button {
  margin: 0.25rem;
}

ul,
li {
  list-style: none;
  white-space: nowrap;
}

li {
  display: inline;
  padding: 0.5rem;
}
```

</Sandpack>

**With Strict Mode, you immediately see that there is a problem**. Strict Mode runs an extra setup+cleanup cycle for every callback ref. This callback ref has no cleanup logic, so it adds refs but doesn't remove them. This is a hint that you're missing a cleanup function.

Strict Mode lets you eagerly find mistakes in callback refs. When you fix your callback by adding a cleanup function in Strict Mode, you _also_ fix many possible future production bugs like the "Scroll to" bug from before:

<Sandpack>

```js src/index.js
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
// ✅ Using StrictMode.
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

```js src/App.js active
import { useRef, useState } from 'react'

export default function CatFriends() {
  const itemsRef = useRef([])
  const [catList, setCatList] = useState(setupCatList)
  const [cat, setCat] = useState('neo')

  function scrollToCat(index) {
    const list = itemsRef.current
    const { node } = list[index]
    node.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }

  const cats = catList.filter((c) => c.type === cat)

  return (
    <>
      <nav>
        <button onClick={() => setCat('neo')}>Neo</button>
        <button onClick={() => setCat('millie')}>Millie</button>
      </nav>
      <hr />
      <nav>
        <span>Scroll to:</span>
        {cats.map((cat, index) => (
          <button key={cat.src} onClick={() => scrollToCat(index)}>
            {index}
          </button>
        ))}
      </nav>
      <div>
        <ul>
          {cats.map((cat) => (
            <li
              key={cat.src}
              ref={(node) => {
                const list = itemsRef.current
                const item = { cat: cat, node }
                list.push(item)
                console.log(
                  `✅ Adding cat to the map. Total cats: ${list.length}`
                )
                if (list.length > 10) {
                  console.log('❌ Too many cats in the list!')
                }
                return () => {
                  list.splice(list.indexOf(item), 1)
                  console.log(
                    `❌ Removing cat from the map. Total cats: ${itemsRef.current.length}`
                  )
                }
              }}
            >
              <img src={cat.src} />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function setupCatList() {
  const catList = []
  for (let i = 0; i < 10; i++) {
    catList.push({ type: 'neo', src: 'https://placecats.com/neo/320/240?' + i })
  }
  for (let i = 0; i < 10; i++) {
    catList.push({
      type: 'millie',
      src: 'https://placecats.com/millie/320/240?' + i,
    })
  }

  return catList
}
```

```css
div {
  width: 100%;
  overflow: hidden;
}

nav {
  text-align: center;
}

button {
  margin: 0.25rem;
}

ul,
li {
  list-style: none;
  white-space: nowrap;
}

li {
  display: inline;
  padding: 0.5rem;
}
```

</Sandpack>

Now on inital mount in StrictMode, the ref callbacks are all setup, cleaned up, and setup again:

```
...
✅ Adding animal to the map. Total animals: 10
...
❌ Removing animal from the map. Total animals: 0
...
✅ Adding animal to the map. Total animals: 10
```

**This is expected.** Strict Mode confirms that the ref callbacks are cleaned up correctly, so the size never grows above the expected amount. After the fix, there are no memory leaks, and all the features work as expected.

Without Strict Mode, it was easy to miss the bug until you clicked around to app to notice broken features. Strict Mode made the bugs appear right away, before you push them to production.

---

### Fixing deprecation warnings enabled by Strict Mode {/_fixing-deprecation-warnings-enabled-by-strict-mode_/}

React warns if some component anywhere inside a `<StrictMode>` tree uses one of these deprecated APIs:

- `UNSAFE_` class lifecycle methods like [`UNSAFE_componentWillMount`](/reference/react/Component#unsafe_componentwillmount). [See alternatives.](https://reactjs.org/blog/2018/03/27/update-on-async-rendering.html#migrating-from-legacy-lifecycles)

These APIs are primarily used in older [class components](/reference/react/Component) so they rarely appear in modern apps.
