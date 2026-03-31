---
title: <Activity>
---

<Intro>

`<Activity>` lets you hide and restore the UI and internal state of its children.

```js
<Activity mode={visibility}>
  <Sidebar />
</Activity>
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `<Activity>` {/_activity_/}

You can use Activity to hide part of your application:

```js [[1, 1, ""hidden""], [2, 2, "<Sidebar />"], [3, 1, ""visible""]]
<Activity mode={isShowingSidebar ? 'visible' : 'hidden'}>
  <Sidebar />
</Activity>
```

When an Activity boundary is <CodeStep step={1}>hidden</CodeStep>, React will visually hide <CodeStep step={2}>its children</CodeStep> using the `display: "none"` CSS property. It will also destroy their Effects, cleaning up any active subscriptions.

While hidden, children still re-render in response to new props, albeit at a lower priority than the rest of the content.

When the boundary becomes <CodeStep step={3}>visible</CodeStep> again, React will reveal the children with their previous state restored, and re-create their Effects.

In this way, Activity can be thought of as a mechanism for rendering "background activity". Rather than completely discarding content that's likely to become visible again, you can use Activity to maintain and restore that content's UI and internal state, while ensuring that your hidden content has no unwanted side effects.

[See more examples below.](#usage)

#### Props {/_props_/}

- `children`: The UI you intend to show and hide.
- `mode`: A string value of either `'visible'` or `'hidden'`. If omitted, defaults to `'visible'`.

#### Caveats {/_caveats_/}

- If an Activity is rendered inside of a [ViewTransition](/reference/react/ViewTransition), and it becomes visible as a result of an update caused by [startTransition](/reference/react/startTransition), it will activate the ViewTransition's `enter` animation. If it becomes hidden, it will activate its `exit` animation.
- A _hidden_ Activity that just renders text will not render anything rather than rendering hidden text, because there’s no corresponding DOM element to apply visibility changes to. For example, `<Activity mode="hidden"><ComponentThatJustReturnsText /></Activity>` will not produce any output in the DOM for `const ComponentThatJustReturnsText = () => "Hello, World!"`. `<Activity mode="visible"><ComponentThatJustReturnsText /></Activity>` will render visible text.

---

## Usage {/_usage_/}

### Restoring the state of hidden components {/_restoring-the-state-of-hidden-components_/}

In React, when you want to conditionally show or hide a component, you typically mount or unmount it based on that condition:

```jsx
{
  isShowingSidebar && <Sidebar />
}
```

But unmounting a component destroys its internal state, which is not always what you want.

When you hide a component using an Activity boundary instead, React will "save" its state for later:

```jsx
<Activity mode={isShowingSidebar ? 'visible' : 'hidden'}>
  <Sidebar />
</Activity>
```

This makes it possible to hide and then later restore components in the state they were previously in.

The following example has a sidebar with an expandable section. You can press "Overview" to reveal the three subitems below it. The main app area also has a button that hides and shows the sidebar.

Try expanding the Overview section, and then toggling the sidebar closed then open:

<Sandpack>

```js src/App.js active
import { useState } from 'react'
import Sidebar from './Sidebar.js'

export default function App() {
  const [isShowingSidebar, setIsShowingSidebar] = useState(true)

  return (
    <>
      {isShowingSidebar && <Sidebar />}

      <main>
        <button onClick={() => setIsShowingSidebar(!isShowingSidebar)}>
          Toggle sidebar
        </button>
        <h1>Main content</h1>
      </main>
    </>
  )
}
```

```js src/Sidebar.js
import { useState } from 'react'

export default function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <nav>
      <button onClick={() => setIsExpanded(!isExpanded)}>
        Overview
        <span className={`indicator ${isExpanded ? 'down' : 'right'}`}>
          &#9650;
        </span>
      </button>

      {isExpanded && (
        <ul>
          <li>Section 1</li>
          <li>Section 2</li>
          <li>Section 3</li>
        </ul>
      )}
    </nav>
  )
}
```

```css
body {
  height: 275px;
  margin: 0;
}
#root {
  display: flex;
  gap: 10px;
  height: 100%;
}
nav {
  padding: 10px;
  background: #eee;
  font-size: 14px;
  height: 100%;
}
main {
  padding: 10px;
}
p {
  margin: 0;
}
h1 {
  margin-top: 10px;
}
.indicator {
  margin-left: 4px;
  display: inline-block;
  rotate: 90deg;
}
.indicator.down {
  rotate: 180deg;
}
```

</Sandpack>

The Overview section always starts out collapsed. Because we unmount the sidebar when `isShowingSidebar` flips to `false`, all its internal state is lost.

This is a perfect use case for Activity. We can preserve the internal state of our sidebar, even when visually hiding it.

Let's replace the conditional rendering of our sidebar with an Activity boundary:

```jsx {7,9}
// Before
{
  isShowingSidebar && <Sidebar />
}

// After
;<Activity mode={isShowingSidebar ? 'visible' : 'hidden'}>
  <Sidebar />
</Activity>
```

and check out the new behavior:

<Sandpack>

```js src/App.js active
import { Activity, useState } from 'react'

import Sidebar from './Sidebar.js'

export default function App() {
  const [isShowingSidebar, setIsShowingSidebar] = useState(true)

  return (
    <>
      <Activity mode={isShowingSidebar ? 'visible' : 'hidden'}>
        <Sidebar />
      </Activity>

      <main>
        <button onClick={() => setIsShowingSidebar(!isShowingSidebar)}>
          Toggle sidebar
        </button>
        <h1>Main content</h1>
      </main>
    </>
  )
}
```

```js src/Sidebar.js
import { useState } from 'react'

export default function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <nav>
      <button onClick={() => setIsExpanded(!isExpanded)}>
        Overview
        <span className={`indicator ${isExpanded ? 'down' : 'right'}`}>
          &#9650;
        </span>
      </button>

      {isExpanded && (
        <ul>
          <li>Section 1</li>
          <li>Section 2</li>
          <li>Section 3</li>
        </ul>
      )}
    </nav>
  )
}
```

```css
body {
  height: 275px;
  margin: 0;
}
#root {
  display: flex;
  gap: 10px;
  height: 100%;
}
nav {
  padding: 10px;
  background: #eee;
  font-size: 14px;
  height: 100%;
}
main {
  padding: 10px;
}
p {
  margin: 0;
}
h1 {
  margin-top: 10px;
}
.indicator {
  margin-left: 4px;
  display: inline-block;
  rotate: 90deg;
}
.indicator.down {
  rotate: 180deg;
}
```

</Sandpack>

Our sidebar's internal state is now restored, without any changes to its implementation.

---

### Restoring the DOM of hidden components {/_restoring-the-dom-of-hidden-components_/}

Since Activity boundaries hide their children using `display: none`, their children's DOM is also preserved when hidden. This makes them great for maintaining ephemeral state in parts of the UI that the user is likely to interact with again.

In this example, the Contact tab has a `<textarea>` where the user can enter a message. If you enter some text, change to the Home tab, then change back to the Contact tab, the draft message is lost:

<Sandpack>

```js src/App.js
import { useState } from 'react'
import TabButton from './TabButton.js'
import Home from './Home.js'
import Contact from './Contact.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('contact')

  return (
    <>
      <TabButton
        isActive={activeTab === 'home'}
        onClick={() => setActiveTab('home')}
      >
        Home
      </TabButton>
      <TabButton
        isActive={activeTab === 'contact'}
        onClick={() => setActiveTab('contact')}
      >
        Contact
      </TabButton>

      <hr />

      {activeTab === 'home' && <Home />}
      {activeTab === 'contact' && <Contact />}
    </>
  )
}
```

```js src/TabButton.js
export default function TabButton({ onClick, children, isActive }) {
  if (isActive) {
    return <b>{children}</b>
  }

  return <button onClick={onClick}>{children}</button>
}
```

```js src/Home.js
export default function Home() {
  return <p>Welcome to my profile!</p>
}
```

```js src/Contact.js active
export default function Contact() {
  return (
    <div>
      <p>Send me a message!</p>

      <textarea />

      <p>You can find me online here:</p>
      <ul>
        <li>admin@mysite.com</li>
        <li>+123456789</li>
      </ul>
    </div>
  )
}
```

```css
body {
  height: 275px;
}
button {
  margin-right: 10px;
}
b {
  display: inline-block;
  margin-right: 10px;
}
.pending {
  color: #777;
}
```

</Sandpack>

This is because we're fully unmounting `Contact` in `App`. When the Contact tab unmounts, the `<textarea>` element's internal DOM state is lost.

If we switch to using an Activity boundary to show and hide the active tab, we can preserve the state of each tab's DOM. Try entering text and switching tabs again, and you'll see the draft message is no longer reset:

<Sandpack>

```js src/App.js active
import { Activity, useState } from 'react'
import TabButton from './TabButton.js'
import Home from './Home.js'
import Contact from './Contact.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('contact')

  return (
    <>
      <TabButton
        isActive={activeTab === 'home'}
        onClick={() => setActiveTab('home')}
      >
        Home
      </TabButton>
      <TabButton
        isActive={activeTab === 'contact'}
        onClick={() => setActiveTab('contact')}
      >
        Contact
      </TabButton>

      <hr />

      <Activity mode={activeTab === 'home' ? 'visible' : 'hidden'}>
        <Home />
      </Activity>
      <Activity mode={activeTab === 'contact' ? 'visible' : 'hidden'}>
        <Contact />
      </Activity>
    </>
  )
}
```

```js src/TabButton.js
export default function TabButton({ onClick, children, isActive }) {
  if (isActive) {
    return <b>{children}</b>
  }

  return <button onClick={onClick}>{children}</button>
}
```

```js src/Home.js
export default function Home() {
  return <p>Welcome to my profile!</p>
}
```

```js src/Contact.js
export default function Contact() {
  return (
    <div>
      <p>Send me a message!</p>

      <textarea />

      <p>You can find me online here:</p>
      <ul>
        <li>admin@mysite.com</li>
        <li>+123456789</li>
      </ul>
    </div>
  )
}
```

```css
body {
  height: 275px;
}
button {
  margin-right: 10px;
}
b {
  display: inline-block;
  margin-right: 10px;
}
.pending {
  color: #777;
}
```

</Sandpack>

Again, the Activity boundary let us preserve the Contact tab's internal state without changing its implementation.

---

### Pre-rendering content that's likely to become visible {/_pre-rendering-content-thats-likely-to-become-visible_/}

So far, we've seen how Activity can hide some content that the user has interacted with, without discarding that content's ephemeral state.

But Activity boundaries can also be used to _prepare_ content that the user has yet to see for the first time:

```jsx [[1, 1, ""hidden""]]
<Activity mode="hidden">
  <SlowComponent />
</Activity>
```

When an Activity boundary is <CodeStep step={1}>hidden</CodeStep> during its initial render, its children won't be visible on the page — but they will _still be rendered_, albeit at a lower priority than the visible content, and without mounting their Effects.

This _pre-rendering_ allows the children to load any code or data they need ahead of time, so that later, when the Activity boundary becomes visible, the children can appear faster with reduced loading times.

Let's look at an example.

In this demo, the Posts tab loads some data. If you press it, you'll see a Suspense fallback displayed while the data is being fetched:

<Sandpack>

```js src/App.js
import { useState, Suspense } from 'react'
import TabButton from './TabButton.js'
import Home from './Home.js'
import Posts from './Posts.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('home')

  return (
    <>
      <TabButton
        isActive={activeTab === 'home'}
        onClick={() => setActiveTab('home')}
      >
        Home
      </TabButton>
      <TabButton
        isActive={activeTab === 'posts'}
        onClick={() => setActiveTab('posts')}
      >
        Posts
      </TabButton>

      <hr />

      <Suspense fallback={<h1>🌀 Loading...</h1>}>
        {activeTab === 'home' && <Home />}
        {activeTab === 'posts' && <Posts />}
      </Suspense>
    </>
  )
}
```

```js src/TabButton.js hidden
export default function TabButton({ onClick, children, isActive }) {
  if (isActive) {
    return <b>{children}</b>
  }

  return <button onClick={onClick}>{children}</button>
}
```

```js src/Home.js
export default function Home() {
  return <p>Welcome to my profile!</p>
}
```

```js src/Posts.js
import { use } from 'react'
import { fetchData } from './data.js'

export default function Posts() {
  const posts = use(fetchData('/posts'))

  return (
    <ul className="items">
      {posts.map((post) => (
        <li className="item" key={post.id}>
          {post.title}
        </li>
      ))}
    </ul>
  )
}
```

```js src/data.js hidden
// Note: the way you would do data fetching depends on
// the framework that you use together with Suspense.
// Normally, the caching logic would be inside a framework.

let cache = new Map()

export function fetchData(url) {
  if (!cache.has(url)) {
    cache.set(url, getData(url))
  }
  return cache.get(url)
}

async function getData(url) {
  if (url.startsWith('/posts')) {
    return await getPosts()
  } else {
    throw Error('Not implemented')
  }
}

async function getPosts() {
  // Add a fake delay to make waiting noticeable.
  await new Promise((resolve) => {
    setTimeout(resolve, 1000)
  })
  let posts = []
  for (let i = 0; i < 10; i++) {
    posts.push({
      id: i,
      title: 'Post #' + (i + 1),
    })
  }
  return posts
}
```

```css
body {
  height: 275px;
}
button {
  margin-right: 10px;
}
b {
  display: inline-block;
  margin-right: 10px;
}
.pending {
  color: #777;
}
video {
  width: 300px;
  margin-top: 10px;
  aspect-ratio: 16/9;
}
```

</Sandpack>

This is because `App` doesn't mount `Posts` until its tab is active.

If we update `App` to use an Activity boundary to show and hide the active tab, `Posts` will be pre-rendered when the app first loads, allowing it to fetch its data before it becomes visible.

Try clicking the Posts tab now:

<Sandpack>

```js src/App.js
import { Activity, useState, Suspense } from 'react'
import TabButton from './TabButton.js'
import Home from './Home.js'
import Posts from './Posts.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('home')

  return (
    <>
      <TabButton
        isActive={activeTab === 'home'}
        onClick={() => setActiveTab('home')}
      >
        Home
      </TabButton>
      <TabButton
        isActive={activeTab === 'posts'}
        onClick={() => setActiveTab('posts')}
      >
        Posts
      </TabButton>

      <hr />

      <Suspense fallback={<h1>🌀 Loading...</h1>}>
        <Activity mode={activeTab === 'home' ? 'visible' : 'hidden'}>
          <Home />
        </Activity>
        <Activity mode={activeTab === 'posts' ? 'visible' : 'hidden'}>
          <Posts />
        </Activity>
      </Suspense>
    </>
  )
}
```

```js src/TabButton.js hidden
export default function TabButton({ onClick, children, isActive }) {
  if (isActive) {
    return <b>{children}</b>
  }

  return <button onClick={onClick}>{children}</button>
}
```

```js src/Home.js
export default function Home() {
  return <p>Welcome to my profile!</p>
}
```

```js src/Posts.js
import { use } from 'react'
import { fetchData } from './data.js'

export default function Posts() {
  const posts = use(fetchData('/posts'))

  return (
    <ul className="items">
      {posts.map((post) => (
        <li className="item" key={post.id}>
          {post.title}
        </li>
      ))}
    </ul>
  )
}
```

```js src/data.js hidden
// Note: the way you would do data fetching depends on
// the framework that you use together with Suspense.
// Normally, the caching logic would be inside a framework.

let cache = new Map()

export function fetchData(url) {
  if (!cache.has(url)) {
    cache.set(url, getData(url))
  }
  return cache.get(url)
}

async function getData(url) {
  if (url.startsWith('/posts')) {
    return await getPosts()
  } else {
    throw Error('Not implemented')
  }
}

async function getPosts() {
  // Add a fake delay to make waiting noticeable.
  await new Promise((resolve) => {
    setTimeout(resolve, 1000)
  })
  let posts = []
  for (let i = 0; i < 10; i++) {
    posts.push({
      id: i,
      title: 'Post #' + (i + 1),
    })
  }
  return posts
}
```

```css
body {
  height: 275px;
}
button {
  margin-right: 10px;
}
b {
  display: inline-block;
  margin-right: 10px;
}
.pending {
  color: #777;
}
video {
  width: 300px;
  margin-top: 10px;
  aspect-ratio: 16/9;
}
```

</Sandpack>

`Posts` was able to prepare itself for a faster render, thanks to the hidden Activity boundary.

---

Pre-rendering components with hidden Activity boundaries is a powerful way to reduce loading times for parts of the UI that the user is likely to interact with next.

<Note>

**Only Suspense-enabled data sources will be fetched during pre-rendering.** They include:

- Data fetching with Suspense-enabled frameworks like [Relay](https://relay.dev/docs/guided-tour/rendering/loading-states/) and [Next.js](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming#streaming-with-suspense)
- Lazy-loading component code with [`lazy`](/reference/react/lazy)
- Reading the value of a cached Promise with [`use`](/reference/react/use)

Activity **does not** detect data that is fetched inside an Effect.

The exact way you would load data in the `Posts` component above depends on your framework. If you use a Suspense-enabled framework, you'll find the details in its data fetching documentation.

Suspense-enabled data fetching without the use of an opinionated framework is not yet supported. The requirements for implementing a Suspense-enabled data source are unstable and undocumented. An official API for integrating data sources with Suspense will be released in a future version of React.

</Note>

---

### Speeding up interactions during page load {/_speeding-up-interactions-during-page-load_/}

React includes an under-the-hood performance optimization called Selective Hydration. It works by hydrating your app's initial HTML _in chunks_, enabling some components to become interactive even if other components on the page haven't loaded their code or data yet.

Suspense boundaries participate in Selective Hydration, because they naturally divide your component tree into units that are independent from one another:

```jsx
function Page() {
  return (
    <>
      <MessageComposer />

      <Suspense fallback="Loading chats...">
        <Chats />
      </Suspense>
    </>
  )
}
```

Here, `MessageComposer` can be fully hydrated during the initial render of the page, even before `Chats` is mounted and starts to fetch its data.

So by breaking up your component tree into discrete units, Suspense allows React to hydrate your app's server-rendered HTML in chunks, enabling parts of your app to become interactive as fast as possible.

But what about pages that don't use Suspense?

Take this tabs example:

```jsx
function Page() {
  const [activeTab, setActiveTab] = useState('home')

  return (
    <>
      <TabButton onClick={() => setActiveTab('home')}>Home</TabButton>
      <TabButton onClick={() => setActiveTab('video')}>Video</TabButton>

      {activeTab === 'home' && <Home />}
      {activeTab === 'video' && <Video />}
    </>
  )
}
```

Here, React must hydrate the entire page all at once. If `Home` or `Video` are slower to render, they could make the tab buttons feel unresponsive during hydration.

Adding Suspense around the active tab would solve this:

```jsx {13,20}
function Page() {
  const [activeTab, setActiveTab] = useState('home')

  return (
    <>
      <TabButton onClick={() => setActiveTab('home')}>Home</TabButton>
      <TabButton onClick={() => setActiveTab('video')}>Video</TabButton>

      <Suspense fallback={<Placeholder />}>
        {activeTab === 'home' && <Home />}
        {activeTab === 'video' && <Video />}
      </Suspense>
    </>
  )
}
```

...but it would also change the UI, since the `Placeholder` fallback would be displayed on the initial render.

Instead, we can use Activity. Since Activity boundaries show and hide their children, they already naturally divide the component tree into independent units. And just like Suspense, this feature allows them to participate in Selective Hydration.

Let's update our example to use Activity boundaries around the active tab:

```jsx {13-18}
function Page() {
  const [activeTab, setActiveTab] = useState('home')

  return (
    <>
      <TabButton onClick={() => setActiveTab('home')}>Home</TabButton>
      <TabButton onClick={() => setActiveTab('video')}>Video</TabButton>

      <Activity mode={activeTab === 'home' ? 'visible' : 'hidden'}>
        <Home />
      </Activity>
      <Activity mode={activeTab === 'video' ? 'visible' : 'hidden'}>
        <Video />
      </Activity>
    </>
  )
}
```

Now our initial server-rendered HTML looks the same as it did in the original version, but thanks to Activity, React can hydrate the tab buttons first, before it even mounts `Home` or `Video`.

---

Thus, in addition to hiding and showing content, Activity boundaries help improve your app's performance during hydration by letting React know which parts of your page can become interactive in isolation.

And even if your page doesn't ever hide part of its content, you can still add always-visible Activity boundaries to improve hydration performance:

```jsx
function Page() {
  return (
    <>
      <Post />

      <Activity>
        <Comments />
      </Activity>
    </>
  )
}
```

---

## Troubleshooting {/_troubleshooting_/}

### My hidden components have unwanted side effects {/_my-hidden-components-have-unwanted-side-effects_/}

An Activity boundary hides its content by setting `display: none` on its children and cleaning up any of their Effects. So, most well-behaved React components that properly clean up their side effects will already be robust to being hidden by Activity.

But there _are_ some situations where a hidden component behaves differently than an unmounted one. Most notably, since a hidden component's DOM is not destroyed, any side effects from that DOM will persist, even after the component is hidden.

As an example, consider a `<video>` tag. Typically it doesn't require any cleanup, because even if you're playing a video, unmounting the tag stops the video and audio from playing in the browser. Try playing the video and then pressing Home in this demo:

<Sandpack>

```js src/App.js active
import { useState } from 'react'
import TabButton from './TabButton.js'
import Home from './Home.js'
import Video from './Video.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('video')

  return (
    <>
      <TabButton
        isActive={activeTab === 'home'}
        onClick={() => setActiveTab('home')}
      >
        Home
      </TabButton>
      <TabButton
        isActive={activeTab === 'video'}
        onClick={() => setActiveTab('video')}
      >
        Video
      </TabButton>

      <hr />

      {activeTab === 'home' && <Home />}
      {activeTab === 'video' && <Video />}
    </>
  )
}
```

```js src/TabButton.js hidden
export default function TabButton({ onClick, children, isActive }) {
  if (isActive) {
    return <b>{children}</b>
  }

  return <button onClick={onClick}>{children}</button>
}
```

```js src/Home.js
export default function Home() {
  return <p>Welcome to my profile!</p>
}
```

```js src/Video.js
export default function Video() {
  return (
    <video
      // 'Big Buck Bunny' licensed under CC 3.0 by the Blender foundation. Hosted by archive.org
      src="https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4"
      controls
      playsInline
    />
  )
}
```

```css
body {
  height: 275px;
}
button {
  margin-right: 10px;
}
b {
  display: inline-block;
  margin-right: 10px;
}
.pending {
  color: #777;
}
video {
  width: 300px;
  margin-top: 10px;
  aspect-ratio: 16/9;
}
```

</Sandpack>

The video stops playing as expected.

Now, let's say we wanted to preserve the timecode where the user last watched, so that when they tab back to the video, it doesn't start over from the beginning again.

This is a great use case for Activity!

Let's update `App` to hide the inactive tab with a hidden Activity boundary instead of unmounting it, and see how the demo behaves this time:

<Sandpack>

```js src/App.js active
import { Activity, useState } from 'react'
import TabButton from './TabButton.js'
import Home from './Home.js'
import Video from './Video.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('video')

  return (
    <>
      <TabButton
        isActive={activeTab === 'home'}
        onClick={() => setActiveTab('home')}
      >
        Home
      </TabButton>
      <TabButton
        isActive={activeTab === 'video'}
        onClick={() => setActiveTab('video')}
      >
        Video
      </TabButton>

      <hr />

      <Activity mode={activeTab === 'home' ? 'visible' : 'hidden'}>
        <Home />
      </Activity>
      <Activity mode={activeTab === 'video' ? 'visible' : 'hidden'}>
        <Video />
      </Activity>
    </>
  )
}
```

```js src/TabButton.js hidden
export default function TabButton({ onClick, children, isActive }) {
  if (isActive) {
    return <b>{children}</b>
  }

  return <button onClick={onClick}>{children}</button>
}
```

```js src/Home.js
export default function Home() {
  return <p>Welcome to my profile!</p>
}
```

```js src/Video.js
export default function Video() {
  return (
    <video
      controls
      playsInline
      // 'Big Buck Bunny' licensed under CC 3.0 by the Blender foundation. Hosted by archive.org
      src="https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4"
    />
  )
}
```

```css
body {
  height: 275px;
}
button {
  margin-right: 10px;
}
b {
  display: inline-block;
  margin-right: 10px;
}
.pending {
  color: #777;
}
video {
  width: 300px;
  margin-top: 10px;
  aspect-ratio: 16/9;
}
```

</Sandpack>

Whoops! The video and audio continue to play even after it's been hidden, because the tab's `<video>` element is still in the DOM.

To fix this, we can add an Effect with a cleanup function that pauses the video:

```jsx {2,4-10,14}
export default function VideoTab() {
  const ref = useRef()

  useLayoutEffect(() => {
    const videoRef = ref.current

    return () => {
      videoRef.pause()
    }
  }, [])

  return <video ref={ref} controls playsInline src="..." />
}
```

We call `useLayoutEffect` instead of `useEffect` because conceptually the clean-up code is tied to the component's UI being visually hidden. If we used a regular effect, the code could be delayed by (say) a re-suspending Suspense boundary or a View Transition.

Let's see the new behavior. Try playing the video, switching to the Home tab, then back to the Video tab:

<Sandpack>

```js src/App.js active
import { Activity, useState } from 'react'
import TabButton from './TabButton.js'
import Home from './Home.js'
import Video from './Video.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('video')

  return (
    <>
      <TabButton
        isActive={activeTab === 'home'}
        onClick={() => setActiveTab('home')}
      >
        Home
      </TabButton>
      <TabButton
        isActive={activeTab === 'video'}
        onClick={() => setActiveTab('video')}
      >
        Video
      </TabButton>

      <hr />

      <Activity mode={activeTab === 'home' ? 'visible' : 'hidden'}>
        <Home />
      </Activity>
      <Activity mode={activeTab === 'video' ? 'visible' : 'hidden'}>
        <Video />
      </Activity>
    </>
  )
}
```

```js src/TabButton.js hidden
export default function TabButton({ onClick, children, isActive }) {
  if (isActive) {
    return <b>{children}</b>
  }

  return <button onClick={onClick}>{children}</button>
}
```

```js src/Home.js
export default function Home() {
  return <p>Welcome to my profile!</p>
}
```

```js src/Video.js
import { useRef, useLayoutEffect } from 'react'

export default function Video() {
  const ref = useRef()

  useLayoutEffect(() => {
    const videoRef = ref.current

    return () => {
      videoRef.pause()
    }
  }, [])

  return (
    <video
      ref={ref}
      controls
      playsInline
      // 'Big Buck Bunny' licensed under CC 3.0 by the Blender foundation. Hosted by archive.org
      src="https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4"
    />
  )
}
```

```css
body {
  height: 275px;
}
button {
  margin-right: 10px;
}
b {
  display: inline-block;
  margin-right: 10px;
}
.pending {
  color: #777;
}
video {
  width: 300px;
  margin-top: 10px;
  aspect-ratio: 16/9;
}
```

</Sandpack>

It works great! Our cleanup function ensures that the video stops playing if it's ever hidden by an Activity boundary, and even better, because the `<video>` tag is never destroyed, the timecode is preserved, and the video itself doesn't need to be initialized or downloaded again when the user switches back to keep watching it.

This is a great example of using Activity to preserve ephemeral DOM state for parts of the UI that become hidden, but the user is likely to interact with again soon.

---

Our example illustrates that for certain tags like `<video>`, unmounting and hiding have different behavior. If a component renders DOM that has a side effect, and you want to prevent that side effect when an Activity boundary hides it, add an Effect with a return function to clean it up.

The most common cases of this will be from the following tags:

- `<video>`
- `<audio>`
- `<iframe>`

Typically, though, most of your React components should already be robust to being hidden by an Activity boundary. And conceptually, you should think of "hidden" Activities as being unmounted.

To eagerly discover other Effects that don't have proper cleanup, which is important not only for Activity boundaries but for many other behaviors in React, we recommend using [`<StrictMode>`](/reference/react/StrictMode).

---

### My hidden components have Effects that aren't running {/_my-hidden-components-have-effects-that-arent-running_/}

When an `<Activity>` is "hidden", all its children's Effects are cleaned up. Conceptually, the children are unmounted, but React saves their state for later. This is a feature of Activity because it means subscriptions won't be active for hidden parts of the UI, reducing the amount of work needed for hidden content.

If you're relying on an Effect mounting to clean up a component's side effects, refactor the Effect to do the work in the returned cleanup function instead.

To eagerly find problematic Effects, we recommend adding [`<StrictMode>`](/reference/react/StrictMode) which will eagerly perform Activity unmounts and mounts to catch any unexpected side-effects.
