---
title: <ViewTransition>
version: canary
---

<Intro>

<Canary>

**The `<ViewTransition />` API is currently only available in React’s Canary and Experimental channels.**

[Learn more about React’s release channels here.](/community/versioning-policy#all-release-channels)

</Canary>

`<ViewTransition>` lets you animate a component tree with Transitions and Suspense.

```js
import { ViewTransition } from 'react'
;<ViewTransition>
  <div>...</div>
</ViewTransition>
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `<ViewTransition>` {/_viewtransition_/}

Wrap a component tree in `<ViewTransition>` to animate it:

```js
<ViewTransition>
  <Page />
</ViewTransition>
```

[See more examples below.](#usage)

<DeepDive>

#### How does `<ViewTransition>` work? {/_how-does-viewtransition-work_/}

Under the hood, React applies `view-transition-name` to inline styles of the nearest DOM node nested inside the `<ViewTransition>` component. If there are multiple sibling DOM nodes like `<ViewTransition><div /><div /></ViewTransition>` then React adds a suffix to the name to make each unique but conceptually they're part of the same one. React doesn't apply these eagerly but only at the time that boundary should participate in an animation.

React automatically calls `startViewTransition` itself behind the scenes so you should never do that yourself. In fact, if you have something else on the page running a ViewTransition React will interrupt it. So it's recommended that you use React itself to coordinate these. If you had other ways to trigger ViewTransitions in the past, we recommend that you migrate to the built-in way.

If there are other React ViewTransitions already running then React will wait for them to finish before starting the next one. However, importantly if there are multiple updates happening while the first one is running, those will all be batched into one. If you start A->B. Then in the meantime you get an update to go to C and then D. When the first A->B animation finishes the next one will animate from B->D.

The `getSnapshotBeforeUpdate` lifecycle will be called before `startViewTransition` and some `view-transition-name` will update at the same time.

Then React calls `startViewTransition`. Inside the `updateCallback`, React will:

- Apply its mutations to the DOM and invoke `useInsertionEffect`.
- Wait for fonts to load.
- Call `componentDidMount`, `componentDidUpdate`, `useLayoutEffect` and refs.
- Wait for any pending Navigation to finish.
- Then React will measure any changes to the layout to see which boundaries will need to animate.

After the ready Promise of the `startViewTransition` is resolved, React will then revert the `view-transition-name`. Then React will invoke the `onEnter`, `onExit`, `onUpdate` and `onShare` callbacks to allow for manual programmatic control over the animations. This will be after the built-in default ones have already been computed.

If a `flushSync` happens to get in the middle of this sequence, then React will skip the Transition since it relies on being able to complete synchronously.

After the finished Promise of the `startViewTransition` is resolved, React will then invoke `useEffect`. This prevents those from interfering with the performance of the animation. However, this is not a guarantee because if another `setState` happens while the animation is running it'll still have to invoke the `useEffect` earlier to preserve the sequential guarantees.

</DeepDive>

#### Props {/_props_/}

- **optional** `name`: A string or object. The name of the View Transition used for shared element transitions. If not provided, React will use a unique name for each View Transition to prevent unexpected animations.
- [View Transition Class](#view-transition-class) props.
- [View Transition Event](#view-transition-event) props.

#### Caveats {/_caveats_/}

- Only use `name` for [shared element transitions](#animating-a-shared-element). For all other animations, React automatically generates a unique name to prevent unexpected animations.
- By default, `setState` updates immediately and does not activate `<ViewTransition>`, only updates wrapped in a [Transition](/reference/react/useTransition), [`<Suspense>`](/reference/react/Suspense), or `useDeferredValue` activate ViewTransition.
- `<ViewTransition>` creates an image that can be moved around, scaled and cross-faded. Unlike Layout Animations you may have seen in React Native or Motion, this means that not every individual Element inside of it animates its position. This can lead to better performance and a more continuous feeling, smooth animation compared to animating every individual piece. However, it can also lose continuity in things that should be moving by themselves. So you might have to add more `<ViewTransition>` boundaries manually as a result.
- Currently, `<ViewTransition>` only works in the DOM. We're working on adding support for React Native and other platforms.

#### Animation triggers {/_animation-triggers_/}

React automatically decides the type of View Transition animation to trigger:

- `enter`: If a `ViewTransition` is the first component inserted in this Transition, then this will activate.
- `exit`: If a `ViewTransition` is the first component deleted in this Transition, then this will activate.
- `update`: If a `ViewTransition` has any DOM mutations inside it that React is doing (such as a prop changing) or if the `ViewTransition` boundary itself changes size or position due to an immediate sibling. If there are nested `ViewTransition` then the mutation applies to them and not the parent.
- `share`: If a named `ViewTransition` is inside a deleted subtree and another named `ViewTransition` with the same name is part of an inserted subtree in the same Transition, they form a Shared Element Transition, and it animates from the deleted one to the inserted one.

By default, `<ViewTransition>` animates with a smooth cross-fade (the browser default view transition).

You can customize the animation by providing a [View Transition Class](#view-transition-class) to the `<ViewTransition>` component for each kind of trigger (see [Styling View Transitions](#styling-view-transitions)), or by using [ViewTransition Events](#view-transition-events) to control the animation with JavaScript using the [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API).

<Note>

#### Always check `prefers-reduced-motion` {/_always-check-prefers-reduced-motion_/}

Many users may prefer not having animations on the page. React doesn't automatically disable animations for this case.

We recommend always using the `@media (prefers-reduced-motion)` media query to disable animations or tone them down based on user preference.

In the future, CSS libraries may have this built-in to their presets.

</Note>

### View Transition Class {/_view-transition-class_/}

`<ViewTransition>` provides props to define what animations trigger:

```js
<ViewTransition default="none" enter="slide-up" exit="slide-down" />
```

#### Props {/_view-transition-class-props_/}

- **optional** `enter`: `"auto"`, `"none"`, a string, or an object.
- **optional** `exit`: `"auto"`, `"none"`, a string, or an object.
- **optional** `update`: `"auto"`, `"none"`, a string, or an object.
- **optional** `share`: `"auto"`, `"none"`, a string, or an object.
- **optional** `default`: `"auto"`, `"none"`, a string, or an object.

#### Caveats {/_view-transition-class-caveats_/}

- If `default` is `"none"` then all other triggers are turned off unless explicitly listed.

#### Values {/_view-transition-values_/}

View Transition class values can be:

- `auto`: the default. Uses the browser default animation.
- `none`: disable animations for this type.
- `<classname>`: a custom CSS class name to use for [customizing View Transitions](#styling-view-transitions).

Object values can be an object with string keys and a value of `auto`, `none` or a custom className:

- `{[type]: value}`: applies `value` if the animation matches the [Transition Type](/reference/react/addTransitionType).
- `{default: value}`: the default value to apply if no [Transition Type](/reference/react/addTransitionType) is matched.

For example, you can define a ViewTransition as:

```js
<ViewTransition
  /* turn off any animation not defined below */
  default="none"
  enter={{
    /* apply slide-in for Transition Type `forward` */
    "forward": 'slide-in',
    /* otherwise use the browser default animation */
    "default": 'auto'
  }}
  /* use the browser default for exit animations*/
  exit="auto"
  /* apply a custom `cross-fade` class for updates */
  update="cross-fade"
>
```

See [Styling View Transitions](#styling-view-transitions) for how to define CSS classes for custom animations.

---

### View Transition Event {/_view-transition-event_/}

View Transition Events allow you to control the animation with JavaScript using the [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API):

```js
<ViewTransition
  onEnter={(instance) => {
    /* ... */
  }}
  onExit={(instance) => {
    /* ... */
  }}
/>
```

#### Props {/_view-transition-event-props_/}

- **optional** `onEnter`: Called when an "enter" animation is triggered.
- **optional** `onExit`: Called when an "exit" animation is triggered.
- **optional** `onShare`: Called when a "share" animation is triggered.
- **optional** `onUpdate`: Called when an "update" animation is triggered.

#### Caveats {/_view-transition-event-caveats_/}

- Only one event fires per `<ViewTransition>` per Transition. `onShare` takes precedence over `onEnter` and `onExit`.
- Each event should return a **cleanup function**. The cleanup function is called when the View Transition finishes, allowing you to cancel or cleanup any animations.

#### Arguments {/_view-transition-event-arguments_/}

Each event receives two arguments:

- `instance`: A View Transition instance that provides access to the view transition [pseudo-elements](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using#the_view_transition_process)
  - `old`: The `::view-transition-old` pseudo-element.
  - `new`: The `::view-transition-new` pseudo-element.
  - `name`: The `view-transition-name` string for this boundary.
  - `group`: The `::view-transition-group` pseudo-element.
  - `imagePair`: The `::view-transition-image-pair` pseudo-element.
- `types`: An `Array<string>` of [Transition Types](/reference/react/addTransitionType) included in the animation. Empty array if no types were specified.

For example, you can define a `onEnter` event that drives the animation using JavaScript:

```js
<ViewTransition
  onEnter={(instance, types) => {
    const anim = instance.new.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 500,
    })
    return () => anim.cancel()
  }}
>
  <div>...</div>
</ViewTransition>
```

See [Animating with JavaScript](#animating-with-javascript) for more examples.

---

## Styling View Transitions {/_styling-view-transitions_/}

<Note>

In many early examples of View Transitions around the web, you'll have seen using a [`view-transition-name`](https://developer.mozilla.org/en-US/docs/Web/CSS/view-transition-name) and then style it using `::view-transition-...(my-name)` selectors. We don't recommend that for styling. Instead, we normally recommend using a View Transition Class instead.

</Note>

To customize the animation for a `<ViewTransition>` you can provide a View Transition Class to one of the activation props. The View Transition Class is a CSS class name that React applies to the child elements when the ViewTransition activates.

For example, to customize an "enter" animation, provide a class name to the `enter` prop:

```js
<ViewTransition enter="slide-in">
```

When the `<ViewTransition>` activates an "enter" animation, React will add the class name `slide-in`. Then you can refer to this class using [view transition pseudo selectors](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API#pseudo-elements) to build reusable animations:

```css
::view-transition-group(.slide-in) {
}
::view-transition-old(.slide-in) {
}
::view-transition-new(.slide-in) {
}
```

In the future, CSS libraries may add built-in animations using View Transition Classes to make this easier to use.

---

## Usage {/_usage_/}

### Animating an element on enter/exit {/_animating-an-element-on-enter_/}

Enter/Exit Transitions trigger when a `<ViewTransition>` is added or removed by a component in a transition:

```js {3}
function Child() {
  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div>Hi</div>
    </ViewTransition>
  )
}

function Parent() {
  const [show, setShow] = useState()
  if (show) {
    return <Child />
  }
  return null
}
```

When `setShow` is called, `show` switches to `true` and the `Child` component is rendered. When `setShow` is called inside `startTransition`, and `Child` renders a `ViewTransition` before any other DOM nodes, an `enter` animation is triggered.

When `show` switches back to `false`, an `exit` animation is triggered.

<Sandpack>

```js src/Video.js hidden
function Thumbnail({ video, children }) {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className={`thumbnail ${video.image}`}
    />
  )
}

export function Video({ video }) {
  return (
    <div className="video">
      <div className="link">
        <Thumbnail video={video}></Thumbnail>
        <div className="info">
          <div className="video-title">{video.title}</div>
          <div className="video-description">{video.description}</div>
        </div>
      </div>
    </div>
  )
}
```

```js
import { ViewTransition, useState, startTransition } from 'react'
import { Video } from './Video'
import videos from './data'

function Item() {
  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <Video video={videos[0]} />
    </ViewTransition>
  )
}

export default function Component() {
  const [showItem, setShowItem] = useState(false)
  return (
    <>
      <button
        onClick={() => {
          startTransition(() => {
            setShowItem((prev) => !prev)
          })
        }}
      >
        {showItem ? '➖' : '➕'}
      </button>

      {showItem ? <Item /> : null}
    </>
  )
}
```

```js src/data.js hidden
export default [
  {
    id: '1',
    title: 'First video',
    description: 'Video description',
    image: 'blue',
  },
]
```

```css
#root {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 200px;
}
button {
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f8ff;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition:
    background-color 0.3s,
    border 0.3s;
}
button:hover {
  border: 2px solid #ccc;
  background-color: #e0e8ff;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  outline-offset: 2px;
  width: 8rem;
  vertical-align: middle;
  background-color: #ffffff;
  background-size: cover;
  user-select: none;
}
.thumbnail.blue {
  background-image: conic-gradient(at top right, #c76a15, #087ea4, #2b3491);
}
.video {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1em;
}
.video .link {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 0.125rem;
  outline-offset: 4px;
  cursor: pointer;
}
.video .info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 8px;
  gap: 0.125rem;
}
.video .info:hover {
  text-decoration: underline;
}
.video-title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
  color: #23272f;
}
.video-description {
  color: #5e687e;
  font-size: 13px;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

<Pitfall>

#### Only top-level ViewTransitions animate on exit/enter {/_only-top-level-viewtransition-animates-on-exit-enter_/}

`<ViewTransition>` only activates exit/enter if it is placed _before_ any DOM nodes.

If there's a `<div>` above `<ViewTransition>`, no exit/enter animations trigger:

```js [3, 5]
function Item() {
  return (
    <div>
      {' '}
      {/* 🚩<div> above <ViewTransition> breaks exit/enter */}
      <ViewTransition enter="auto" exit="auto" default="none">
        <Video video={videos[0]} />
      </ViewTransition>
    </div>
  )
}
```

This constraint prevents subtle bugs where too much or too little animates.

</Pitfall>

---

### Animating enter/exit with Activity {/_animating-enter-exit-with-activity_/}

If you want to animate a component in and out while preserving its state, or pre-rendering content for an animation, you can use [`<Activity>`](/reference/react/Activity). When a `<ViewTransition>` inside an `<Activity>` becomes visible, the `enter` animation activates. When it becomes hidden, the `exit` animation activates:

```js
<Activity mode={isVisible ? 'visible' : 'hidden'}>
  <ViewTransition enter="auto" exit="auto">
    <Counter />
  </ViewTransition>
</Activity>
```

In this example, `Counter` has a counter with internal state. Try incrementing the counter, hiding it, then showing it again. The counter's value is preserved while the sidebar animates in and out:

<Sandpack>

```js
import { Activity, ViewTransition, useState, startTransition } from 'react'

export default function App() {
  const [show, setShow] = useState(true)
  return (
    <div className="layout">
      <Toggle show={show} setShow={setShow} />
      <Activity mode={show ? 'visible' : 'hidden'}>
        <ViewTransition enter="auto" exit="auto" default="none">
          <Counter />
        </ViewTransition>
      </Activity>
    </div>
  )
}
function Toggle({ show, setShow }) {
  return (
    <button
      className="toggle"
      onClick={() => {
        startTransition(() => {
          setShow((s) => !s)
        })
      }}
    >
      {show ? 'Hide' : 'Show'}
    </button>
  )
}
function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div className="counter">
      <h2>Counter</h2>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  )
}
```

```css
.layout {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  min-height: 200px;
}
.counter {
  padding: 15px;
  background: #f0f4f8;
  border-radius: 8px;
  width: 200px;
}
.counter h2 {
  margin: 0 0 10px 0;
  font-size: 16px;
}
.counter p {
  margin: 0 0 10px 0;
}
.toggle {
  padding: 8px 16px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #f0f8ff;
  cursor: pointer;
  font-size: 14px;
}
.toggle:hover {
  background: #e0e8ff;
}
.counter button {
  padding: 4px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

Without `<Activity>`, the counter would reset to `0` every time the sidebar reappears.

---

### Animating a shared element {/_animating-a-shared-element_/}

Normally, we don't recommend assigning a name to a `<ViewTransition>` and instead let React assign it an automatic name. The reason you might want to assign a name is to animate between completely different components when one tree unmounts and another tree mounts at the same time, to preserve continuity.

```js
<ViewTransition name={UNIQUE_NAME}>
  <Child />
</ViewTransition>
```

When one tree unmounts and another mounts, if there's a pair where the same name exists in the unmounting tree and the mounting tree, they trigger the "share" animation on both. It animates from the unmounting side to the mounting side.

Unlike an exit/enter animation this can be deeply inside the deleted/mounted tree. If a `<ViewTransition>` would also be eligible for exit/enter, then the "share" animation takes precedence.

If Transition first unmounts one side and then leads to a `<Suspense>` fallback being shown before eventually the new name being mounted, then no shared element transition happens.

<Sandpack>

```js
import { ViewTransition, useState, startTransition } from 'react'
import { Video, Thumbnail, FullscreenVideo } from './Video'
import videos from './data'

export default function Component() {
  const [fullscreen, setFullscreen] = useState(false)
  if (fullscreen) {
    return (
      <FullscreenVideo
        video={videos[0]}
        onExit={() => startTransition(() => setFullscreen(false))}
      />
    )
  }
  return (
    <Video
      video={videos[0]}
      onClick={() => startTransition(() => setFullscreen(true))}
    />
  )
}
```

```js src/Video.js
import { ViewTransition } from 'react'

const THUMBNAIL_NAME = 'video-thumbnail'

export function Thumbnail({ video, children }) {
  return (
    <ViewTransition name={THUMBNAIL_NAME}>
      <div
        aria-hidden="true"
        tabIndex={-1}
        className={`thumbnail ${video.image}`}
      />
    </ViewTransition>
  )
}

export function Video({ video, onClick }) {
  return (
    <div className="video">
      <div className="link" onClick={onClick}>
        <Thumbnail video={video} />
        <div className="info">
          <div className="video-title">{video.title}</div>
          <div className="video-description">{video.description}</div>
        </div>
      </div>
    </div>
  )
}

export function FullscreenVideo({ video, onExit }) {
  return (
    <div className="fullscreenLayout">
      <ViewTransition name={THUMBNAIL_NAME}>
        <div
          aria-hidden="true"
          tabIndex={-1}
          className={`thumbnail ${video.image} fullscreen`}
        />
        <button className="close-button" onClick={onExit}>
          ✖
        </button>
      </ViewTransition>
    </div>
  )
}
```

```js src/data.js hidden
export default [
  {
    id: '1',
    title: 'First video',
    description: 'Video description',
    image: 'blue',
  },
]
```

```css
#root {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 300px;
}
button {
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f8ff;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition:
    background-color 0.3s,
    border 0.3s;
}
button:hover {
  border: 2px solid #ccc;
  background-color: #e0e8ff;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  outline-offset: 2px;
  width: 8rem;
  vertical-align: middle;
  background-color: #ffffff;
  background-size: cover;
  user-select: none;
}
.thumbnail.blue {
  background-image: conic-gradient(at top right, #c76a15, #087ea4, #2b3491);
}
.thumbnail.red {
  background-image: conic-gradient(at top right, #c76a15, #a6423a, #2b3491);
}
.thumbnail.fullscreen {
  width: 100%;
}
.video {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1em;
}
.video .link {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 0.125rem;
  outline-offset: 4px;
  cursor: pointer;
}
.video .info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 8px;
  gap: 0.125rem;
}
.video .info:hover {
  text-decoration: underline;
}
.video-title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
  color: #23272f;
}
.video-description {
  color: #5e687e;
  font-size: 13px;
}
.fullscreenLayout {
  position: relative;
  height: 100%;
  width: 100%;
}
.close-button {
  position: absolute;
  top: 10px;
  right: 10px;
  color: black;
}
@keyframes progress-animation {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

<Note>

If either the mounted or unmounted side of a pair is outside the viewport, then no pair is formed. This ensures that it doesn't fly in or out of the viewport when something is scrolled. Instead it's treated as a regular enter/exit by itself.

This does not happen if the same Component instance changes position, which triggers an "update". Those animate regardless of whether one position is outside the viewport.

There is a known case where if a deeply nested unmounted `<ViewTransition>` is inside the viewport but the mounted side is not within the viewport, then the unmounted side animates as its own "exit" animation even if it's deeply nested instead of as part of the parent animation.

</Note>

<Pitfall>

It's important that there's only one thing with the same name mounted at a time in the entire app. Therefore it's important to use unique namespaces for the name to avoid conflicts. To ensure you can do this you might want to add a constant in a separate module that you import.

```js
export const MY_NAME = "my-globally-unique-name";
import {MY_NAME} from './shared-name';
...
<ViewTransition name={MY_NAME}>
```

</Pitfall>

---

### Animating reorder of items in a list {/_animating-reorder-of-items-in-a-list_/}

```js
items.map((item) => <Component key={item.id} item={item} />)
```

When reordering a list, without updating the content, the "update" animation triggers on each `<ViewTransition>` in the list if they're outside a DOM node. Similar to enter/exit animations.

This means that this will trigger the animation on this `<ViewTransition>`:

```js
function Component() {
  return (
    <ViewTransition>
      <div>...</div>
    </ViewTransition>
  )
}
```

<Sandpack>

```js src/Video.js hidden
function Thumbnail({ video }) {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className={`thumbnail ${video.image}`}
    />
  )
}

export function Video({ video }) {
  return (
    <div className="video">
      <div className="link">
        <Thumbnail video={video}></Thumbnail>
        <div className="info">
          <div className="video-title">{video.title}</div>
          <div className="video-description">{video.description}</div>
        </div>
      </div>
    </div>
  )
}
```

```js
import { ViewTransition, useState, startTransition } from 'react'
import { Video } from './Video'
import videos from './data'

export default function Component() {
  const [orderedVideos, setOrderedVideos] = useState(videos)
  const reorder = () => {
    startTransition(() => {
      setOrderedVideos((prev) => {
        return [...prev.sort(() => Math.random() - 0.5)]
      })
    })
  }
  return (
    <>
      <button onClick={reorder}>🎲</button>
      <div className="listContainer">
        {orderedVideos.map((video, i) => {
          return (
            <ViewTransition key={video.title}>
              <Video video={video} />
            </ViewTransition>
          )
        })}
      </div>
    </>
  )
}
```

```js src/data.js hidden
export default [
  {
    id: '1',
    title: 'First video',
    description: 'Video description',
    image: 'blue',
  },
  {
    id: '2',
    title: 'Second video',
    description: 'Video description',
    image: 'red',
  },
  {
    id: '3',
    title: 'Third video',
    description: 'Video description',
    image: 'green',
  },
  {
    id: '4',
    title: 'Fourth video',
    description: 'Video description',
    image: 'purple',
  },
]
```

```css
#root {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 150px;
}
button {
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f8ff;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition:
    background-color 0.3s,
    border 0.3s;
}
button:hover {
  border: 2px solid #ccc;
  background-color: #e0e8ff;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  outline-offset: 2px;
  width: 8rem;
  vertical-align: middle;
  background-color: #ffffff;
  background-size: cover;
  user-select: none;
}
.thumbnail.blue {
  background-image: conic-gradient(at top right, #c76a15, #087ea4, #2b3491);
}
.thumbnail.red {
  background-image: conic-gradient(at top right, #c76a15, #a6423a, #2b3491);
}
.thumbnail.green {
  background-image: conic-gradient(at top right, #c76a15, #388f7f, #2b3491);
}
.thumbnail.purple {
  background-image: conic-gradient(at top right, #c76a15, #575fb7, #2b3491);
}
.video {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1em;
}
.video .link {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 0.125rem;
  outline-offset: 4px;
}
.video .info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 8px;
  gap: 0.125rem;
}
.video .info:hover {
  text-decoration: underline;
}
.video-title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
  color: #23272f;
}
.video-description {
  color: #5e687e;
  font-size: 13px;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

However, this wouldn't animate each individual item:

```js
function Component() {
  return (
    <div>
      <ViewTransition>...</ViewTransition>
    </div>
  )
}
```

Instead, any parent `<ViewTransition>` would cross-fade. If there is no parent `<ViewTransition>` then there's no animation in that case.

<Sandpack>

```js src/Video.js hidden
function Thumbnail({ video }) {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className={`thumbnail ${video.image}`}
    />
  )
}

export function Video({ video }) {
  return (
    <div className="video">
      <div className="link">
        <Thumbnail video={video}></Thumbnail>
        <div className="info">
          <div className="video-title">{video.title}</div>
          <div className="video-description">{video.description}</div>
        </div>
      </div>
    </div>
  )
}
```

```js
import { ViewTransition, useState, startTransition } from 'react'
import { Video } from './Video'
import videos from './data'

export default function Component() {
  const [orderedVideos, setOrderedVideos] = useState(videos)
  const reorder = () => {
    startTransition(() => {
      setOrderedVideos((prev) => {
        return [...prev.sort(() => Math.random() - 0.5)]
      })
    })
  }
  return (
    <>
      <button onClick={reorder}>🎲</button>
      <ViewTransition>
        <div className="listContainer">
          {orderedVideos.map((video, i) => {
            return <Video video={video} key={video.title} />
          })}
        </div>
      </ViewTransition>
    </>
  )
}
```

```js src/data.js hidden
export default [
  {
    id: '1',
    title: 'First video',
    description: 'Video description',
    image: 'blue',
  },
  {
    id: '2',
    title: 'Second video',
    description: 'Video description',
    image: 'red',
  },
  {
    id: '3',
    title: 'Third video',
    description: 'Video description',
    image: 'green',
  },
  {
    id: '4',
    title: 'Fourth video',
    description: 'Video description',
    image: 'purple',
  },
]
```

```css
#root {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 150px;
}
button {
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f8ff;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition:
    background-color 0.3s,
    border 0.3s;
}
button:hover {
  border: 2px solid #ccc;
  background-color: #e0e8ff;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  outline-offset: 2px;
  width: 8rem;
  vertical-align: middle;
  background-color: #ffffff;
  background-size: cover;
  user-select: none;
}
.thumbnail.blue {
  background-image: conic-gradient(at top right, #c76a15, #087ea4, #2b3491);
}
.thumbnail.red {
  background-image: conic-gradient(at top right, #c76a15, #a6423a, #2b3491);
}
.thumbnail.green {
  background-image: conic-gradient(at top right, #c76a15, #388f7f, #2b3491);
}
.thumbnail.purple {
  background-image: conic-gradient(at top right, #c76a15, #575fb7, #2b3491);
}
.video {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1em;
}
.video .link {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 0.125rem;
  outline-offset: 4px;
}
.video .info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 8px;
  gap: 0.125rem;
}
.video .info:hover {
  text-decoration: underline;
}
.video-title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
  color: #23272f;
}
.video-description {
  color: #5e687e;
  font-size: 13px;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

This means you might want to avoid wrapper elements in lists where you want to allow the Component to control its own reorder animation:

```
items.map(item => <div><Component key={item.id} item={item} /></div>)
```

The above rule also applies if one of the items updates to resize, which then causes the siblings to resize, it'll also animate its sibling `<ViewTransition>` but only if they're immediate siblings.

This means that during an update, which causes a lot of re-layout, it doesn't individually animate every `<ViewTransition>` on the page. That would lead to a lot of noisy animations which distracts from the actual change. Therefore React is more conservative about when an individual animation triggers.

<Pitfall>

It's important to properly use keys to preserve identity when reordering lists. It might seem like you could use "name", shared element transitions, to animate reorders but that would not trigger if one side was outside the viewport. To animate a reorder you often want to show that it went to a position outside the viewport.

</Pitfall>

---

### Animating from Suspense content {/_animating-from-suspense-content_/}

Like any Transition, React waits for data and new CSS (`<link rel="stylesheet" precedence="...">`) before running the animation. In addition to this, ViewTransitions also wait up to 500ms for new fonts to load before starting the animation to avoid them flickering in later. For the same reason, an image wrapped in ViewTransition will wait for the image to load.

If it's inside a new Suspense boundary instance, then the fallback is shown first. After the Suspense boundary fully loads, it triggers the `<ViewTransition>` to animate the reveal to the content.

There are two ways to animate Suspense boundaries depending on where you place the `<ViewTransition>`:

**Update:**

```
<ViewTransition>
  <Suspense fallback={<A />}>
    <B />
  </Suspense>
</ViewTransition>
```

In this scenario when the content goes from A to B, it'll be treated as an "update" and apply that class if appropriate. Both A and B will get the same view-transition-name and therefore they're acting as a cross-fade by default.

<Sandpack>

```js src/Video.js hidden
function Thumbnail({ video, children }) {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className={`thumbnail ${video.image}`}
    />
  )
}

export function Video({ video }) {
  return (
    <div className="video">
      <div className="link">
        <Thumbnail video={video}></Thumbnail>
        <div className="info">
          <div className="video-title">{video.title}</div>
          <div className="video-description">{video.description}</div>
        </div>
      </div>
    </div>
  )
}

export function VideoPlaceholder() {
  const video = { image: 'loading' }
  return (
    <div className="video">
      <div className="link">
        <Thumbnail video={video}></Thumbnail>
        <div className="info">
          <div className="video-title loading" />
          <div className="video-description loading" />
        </div>
      </div>
    </div>
  )
}
```

```js
import { ViewTransition, useState, startTransition, Suspense } from 'react'
import { Video, VideoPlaceholder } from './Video'
import { useLazyVideoData } from './data'

function LazyVideo() {
  const video = useLazyVideoData()
  return <Video video={video} />
}

export default function Component() {
  const [showItem, setShowItem] = useState(false)
  return (
    <>
      <button
        onClick={() => {
          startTransition(() => {
            setShowItem((prev) => !prev)
          })
        }}
      >
        {showItem ? '➖' : '➕'}
      </button>
      {showItem ? (
        <ViewTransition>
          <Suspense fallback={<VideoPlaceholder />}>
            <LazyVideo />
          </Suspense>
        </ViewTransition>
      ) : null}
    </>
  )
}
```

```js src/data.js hidden
import { use } from 'react'

let cache = null

function fetchVideo() {
  if (!cache) {
    cache = new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id: '1',
          title: 'First video',
          description: 'Video description',
          image: 'blue',
        })
      }, 1000)
    })
  }
  return cache
}

export function useLazyVideoData() {
  return use(fetchVideo())
}
```

```css
#root {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 200px;
}
button {
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f8ff;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition:
    background-color 0.3s,
    border 0.3s;
}
button:hover {
  border: 2px solid #ccc;
  background-color: #e0e8ff;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  outline-offset: 2px;
  width: 8rem;
  vertical-align: middle;
  background-color: #ffffff;
  background-size: cover;
  user-select: none;
}
.thumbnail.blue {
  background-image: conic-gradient(at top right, #c76a15, #087ea4, #2b3491);
}
.loading {
  background-image: linear-gradient(
    90deg,
    rgba(173, 216, 230, 0.3) 25%,
    rgba(135, 206, 250, 0.5) 50%,
    rgba(173, 216, 230, 0.3) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
.video {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1em;
}
.video .link {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 0.125rem;
  outline-offset: 4px;
  cursor: pointer;
}
.video .info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 8px;
  gap: 0.125rem;
}
.video .info:hover {
  text-decoration: underline;
}
.video-title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
  color: #23272f;
}
.video-title.loading {
  height: 20px;
  width: 80px;
  border-radius: 0.5rem;
}
.video-description {
  color: #5e687e;
  font-size: 13px;
  border-radius: 0.5rem;
}
.video-description.loading {
  height: 15px;
  width: 100px;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

**Enter/Exit:**

```
<Suspense fallback={<ViewTransition><A /></ViewTransition>}>
  <ViewTransition><B /></ViewTransition>
</Suspense>
```

In this scenario, these are two separate ViewTransition instances each with their own `view-transition-name`. This will be treated as an "exit" of the `<A>` and an "enter" of the `<B>`.

You can achieve different effects depending on where you choose to place the `<ViewTransition>` boundary.

---

### Opting-out of an animation {/_opting-out-of-an-animation_/}

Sometimes you're wrapping a large existing component, like a whole page, and you want to animate some updates, such as changing the theme. However, you don't want it to opt-in all updates inside the whole page to cross-fade when they're updating. Especially if you're incrementally adding more animations.

You can use the class "none" to opt-out of an animation. By wrapping your children in a "none" you can disable animations for updates to them while the parent still triggers.

```js
<ViewTransition>
  <div className={theme}>
    <ViewTransition update="none">{children}</ViewTransition>
  </div>
</ViewTransition>
```

This will only animate if the theme changes and not if only the children update. The children can still opt-in again with their own `<ViewTransition>` but at least it's manual again.

---

### Customizing animations {/_customizing-animations_/}

By default, `<ViewTransition>` includes the default cross-fade from the browser.

To customize animations, you can provide props to the `<ViewTransition>` component to specify which animations to use, based on how the `<ViewTransition>` activates.

For example, we can slow down the default cross fade animation:

```js
<ViewTransition default="slow-fade">
  <Video />
</ViewTransition>
```

And define slow-fade in CSS using view transition classes:

```css
::view-transition-old(.slow-fade) {
  animation-duration: 500ms;
}

::view-transition-new(.slow-fade) {
  animation-duration: 500ms;
}
```

<Sandpack>

```js src/Video.js hidden
function Thumbnail({ video, children }) {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className={`thumbnail ${video.image}`}
    />
  )
}

export function Video({ video }) {
  return (
    <div className="video">
      <div className="link">
        <Thumbnail video={video}></Thumbnail>

        <div className="info">
          <div className="video-title">{video.title}</div>
          <div className="video-description">{video.description}</div>
        </div>
      </div>
    </div>
  )
}
```

```js
import { ViewTransition, useState, startTransition } from 'react'
import { Video } from './Video'
import videos from './data'

function Item() {
  return (
    <ViewTransition default="slow-fade">
      <Video video={videos[0]} />
    </ViewTransition>
  )
}

export default function Component() {
  const [showItem, setShowItem] = useState(false)
  return (
    <>
      <button
        onClick={() => {
          startTransition(() => {
            setShowItem((prev) => !prev)
          })
        }}
      >
        {showItem ? '➖' : '➕'}
      </button>

      {showItem ? <Item /> : null}
    </>
  )
}
```

```js src/data.js hidden
export default [
  {
    id: '1',
    title: 'First video',
    description: 'Video description',
    image: 'blue',
  },
]
```

```css
::view-transition-old(.slow-fade) {
  animation-duration: 500ms;
}

::view-transition-new(.slow-fade) {
  animation-duration: 500ms;
}

#root {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 200px;
}
button {
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f8ff;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition:
    background-color 0.3s,
    border 0.3s;
}
button:hover {
  border: 2px solid #ccc;
  background-color: #e0e8ff;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  outline-offset: 2px;
  width: 8rem;
  vertical-align: middle;
  background-color: #ffffff;
  background-size: cover;
  user-select: none;
}
.thumbnail.blue {
  background-image: conic-gradient(at top right, #c76a15, #087ea4, #2b3491);
}
.video {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1em;
}
.video .link {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 0.125rem;
  outline-offset: 4px;
  cursor: pointer;
}
.video .info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 8px;
  gap: 0.125rem;
}
.video .info:hover {
  text-decoration: underline;
}
.video-title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
  color: #23272f;
}
.video-description {
  color: #5e687e;
  font-size: 13px;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

In addition to setting the `default`, you can also provide configurations for `enter`, `exit`, `update`, and `share` animations.

<Sandpack>

```js src/Video.js hidden
function Thumbnail({ video, children }) {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className={`thumbnail ${video.image}`}
    />
  )
}

export function Video({ video }) {
  return (
    <div className="video">
      <div className="link">
        <Thumbnail video={video}></Thumbnail>

        <div className="info">
          <div className="video-title">{video.title}</div>
          <div className="video-description">{video.description}</div>
        </div>
      </div>
    </div>
  )
}
```

```js
import { ViewTransition, useState, startTransition } from 'react'
import { Video } from './Video'
import videos from './data'

function Item() {
  return (
    <ViewTransition enter="slide-in" exit="slide-out">
      <Video video={videos[0]} />
    </ViewTransition>
  )
}

export default function Component() {
  const [showItem, setShowItem] = useState(false)
  return (
    <>
      <button
        onClick={() => {
          startTransition(() => {
            setShowItem((prev) => !prev)
          })
        }}
      >
        {showItem ? '➖' : '➕'}
      </button>

      {showItem ? <Item /> : null}
    </>
  )
}
```

```js src/data.js hidden
export default [
  {
    id: '1',
    title: 'First video',
    description: 'Video description',
    image: 'blue',
  },
]
```

```css
::view-transition-old(.slide-in) {
  animation-name: slideOutRight;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

::view-transition-new(.slide-in) {
  animation-name: slideInRight;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

::view-transition-old(.slide-out) {
  animation-name: slideOutLeft;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

::view-transition-new(.slide-out) {
  animation-name: slideInLeft;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

@keyframes slideOutLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}

@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutRight {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

#root {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 200px;
}
button {
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f8ff;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition:
    background-color 0.3s,
    border 0.3s;
}
button:hover {
  border: 2px solid #ccc;
  background-color: #e0e8ff;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  outline-offset: 2px;
  width: 8rem;
  vertical-align: middle;
  background-color: #ffffff;
  background-size: cover;
  user-select: none;
}
.thumbnail.blue {
  background-image: conic-gradient(at top right, #c76a15, #087ea4, #2b3491);
}
.video {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1em;
}
.video .link {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 0.125rem;
  outline-offset: 4px;
  cursor: pointer;
}
.video .info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 8px;
  gap: 0.125rem;
}
.video .info:hover {
  text-decoration: underline;
}
.video-title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
  color: #23272f;
}
.video-description {
  color: #5e687e;
  font-size: 13px;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

---

### Customizing animations with types {/_customizing-animations-with-types_/}

You can use the [`addTransitionType`](/reference/react/addTransitionType) API to add a class name to the child elements when a specific transition type is activated for a specific activation trigger. This allows you to customize the animation for each type of transition.

For example, to customize the animation for all forward and backward navigations:

```js
;<ViewTransition
  default={{
    'navigation-back': 'slide-right',
    'navigation-forward': 'slide-left',
  }}
>
  <div>...</div>
</ViewTransition>

// in your router:
startTransition(() => {
  addTransitionType('navigation-' + navigationType)
})
```

When the ViewTransition activates a "navigation-back" animation, React will add the class name "slide-right". When the ViewTransition activates a "navigation-forward" animation, React will add the class name "slide-left".

In the future, routers and other libraries may add support for standard view-transition types and styles.

<Sandpack>

```js src/Video.js hidden
function Thumbnail({ video, children }) {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className={`thumbnail ${video.image}`}
    />
  )
}

export function Video({ video }) {
  return (
    <div className="video">
      <div className="link">
        <Thumbnail video={video}></Thumbnail>
        <div className="info">
          <div className="video-title">{video.title}</div>
          <div className="video-description">{video.description}</div>
        </div>
      </div>
    </div>
  )
}
```

```js
import {
  ViewTransition,
  addTransitionType,
  useState,
  startTransition,
} from 'react'
import { Video } from './Video'
import videos from './data'

function Item() {
  return (
    <ViewTransition
      enter={{
        'add-video-back': 'slide-in-back',
        'add-video-forward': 'slide-in-forward',
      }}
      exit={{
        'remove-video-back': 'slide-in-forward',
        'remove-video-forward': 'slide-in-back',
      }}
    >
      <Video video={videos[0]} />
    </ViewTransition>
  )
}

export default function Component() {
  const [showItem, setShowItem] = useState(false)
  return (
    <>
      <div className="button-container">
        <button
          onClick={() => {
            startTransition(() => {
              if (showItem) {
                addTransitionType('remove-video-back')
              } else {
                addTransitionType('add-video-back')
              }
              setShowItem((prev) => !prev)
            })
          }}
        >
          ⬅️
        </button>
        <button
          onClick={() => {
            startTransition(() => {
              if (showItem) {
                addTransitionType('remove-video-forward')
              } else {
                addTransitionType('add-video-forward')
              }
              setShowItem((prev) => !prev)
            })
          }}
        >
          ➡️
        </button>
      </div>
      {showItem ? <Item /> : null}
    </>
  )
}
```

```js src/data.js hidden
export default [
  {
    id: '1',
    title: 'First video',
    description: 'Video description',
    image: 'blue',
  },
]
```

```css
::view-transition-old(.slide-in-back) {
  animation-name: slideOutRight;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

::view-transition-new(.slide-in-back) {
  animation-name: slideInRight;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

::view-transition-old(.slide-out-back) {
  animation-name: slideOutLeft;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

::view-transition-new(.slide-out-back) {
  animation-name: slideInLeft;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

::view-transition-old(.slide-in-forward) {
  animation-name: slideOutLeft;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

::view-transition-new(.slide-in-forward) {
  animation-name: slideInLeft;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

::view-transition-old(.slide-out-forward) {
  animation-name: slideOutRight;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

::view-transition-new(.slide-out-forward) {
  animation-name: slideInRight;
  animation-duration: 500ms;
  animation-timing-function: ease-in-out;
}

@keyframes slideOutLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}

@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutRight {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

#root {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 200px;
}
button {
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f8ff;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition:
    background-color 0.3s,
    border 0.3s;
}
button:hover {
  border: 2px solid #ccc;
  background-color: #e0e8ff;
}
.button-container {
  display: flex;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  outline-offset: 2px;
  width: 8rem;
  vertical-align: middle;
  background-color: #ffffff;
  background-size: cover;
  user-select: none;
}
.thumbnail.blue {
  background-image: conic-gradient(at top right, #c76a15, #087ea4, #2b3491);
}
.video {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1em;
}
.video .link {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 0.125rem;
  outline-offset: 4px;
  cursor: pointer;
}
.video .info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 8px;
  gap: 0.125rem;
}
.video .info:hover {
  text-decoration: underline;
}
.video-title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
  color: #23272f;
}
.video-description {
  color: #5e687e;
  font-size: 13px;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

---

### Animating with JavaScript {/_animating-with-javascript_/}

While [View Transition Classes](#view-transition-class) let you define animations with CSS, sometimes you need imperative control over the animation. The `onEnter`, `onExit`, `onUpdate`, and `onShare` callbacks give you direct access to the view transition pseudo-elements so you can animate them using the [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API).

Each callback receives an `instance` with `.old` and `.new` properties representing the view transition pseudo-elements. You can call `.animate()` on them just like you would on a DOM element:

```js
<ViewTransition
  onEnter={(instance) => {
    const anim = instance.new.animate(
      [{ transform: 'scale(0.8)' }, { transform: 'scale(1)' }],
      { duration: 300, easing: 'ease-out' }
    )
    return () => anim.cancel()
  }}
>
  <div>...</div>
</ViewTransition>
```

This allows you to combine CSS-driven animations and JavaScript-driven animations.

In the following example, the default cross-fade is handled by CSS, and the slide animations are driven by JavaScript in the `onEnter` and `onExit` animations:

<Sandpack>

```js src/Video.js hidden
function Thumbnail({ video, children }) {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className={`thumbnail ${video.image}`}
    />
  )
}

export function Video({ video }) {
  return (
    <div className="video">
      <div className="link">
        <Thumbnail video={video}></Thumbnail>

        <div className="info">
          <div className="video-title">{video.title}</div>
          <div className="video-description">{video.description}</div>
        </div>
      </div>
    </div>
  )
}
```

```js
import { ViewTransition, useState, startTransition } from 'react'
import { Video } from './Video'
import videos from './data'
import { SLIDE_IN, SLIDE_OUT } from './animations'

function Item() {
  return (
    <ViewTransition
      default="none"
      /* CSS driven cross fade defaults */
      enter="auto"
      exit="auto"
      /* JS driven slide animations */
      onEnter={(instance) => {
        const anim = instance.new.animate(SLIDE_IN, {
          duration: 500,
          easing: 'ease-out',
        })
        return () => anim.cancel()
      }}
      onExit={(instance) => {
        const anim = instance.old.animate(SLIDE_OUT, {
          duration: 300,
          easing: 'ease-in',
        })
        return () => anim.cancel()
      }}
    >
      <Video video={videos[0]} />
    </ViewTransition>
  )
}

export default function Component() {
  const [showItem, setShowItem] = useState(false)
  return (
    <>
      <button
        onClick={() => {
          startTransition(() => {
            setShowItem((prev) => !prev)
          })
        }}
      >
        {showItem ? '➖' : '➕'}
      </button>

      {showItem ? <Item /> : null}
    </>
  )
}
```

```js src/animations.js
export const SLIDE_IN = [
  { transform: 'translateY(20px)' },
  { transform: 'translateY(0)' },
]

export const SLIDE_OUT = [
  { transform: 'translateY(0)' },
  { transform: 'translateY(-20px)' },
]
```

```js src/data.js hidden
export default [
  {
    id: '1',
    title: 'First video',
    description: 'Video description',
    image: 'blue',
  },
]
```

```css
#root {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 200px;
}
button {
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f8ff;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition:
    background-color 0.3s,
    border 0.3s;
}
button:hover {
  border: 2px solid #ccc;
  background-color: #e0e8ff;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  outline-offset: 2px;
  width: 8rem;
  vertical-align: middle;
  background-color: #ffffff;
  background-size: cover;
  user-select: none;
}
.thumbnail.blue {
  background-image: conic-gradient(at top right, #c76a15, #087ea4, #2b3491);
}
.video {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1em;
}
.video .link {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 0.125rem;
  outline-offset: 4px;
  cursor: pointer;
}
.video .info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 8px;
  gap: 0.125rem;
}
.video .info:hover {
  text-decoration: underline;
}
.video-title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
  color: #23272f;
}
.video-description {
  color: #5e687e;
  font-size: 13px;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

<Note>

#### Always clean up View Transition Events {/_always-clean-up-view-transition-events_/}

View Transition Events should always return a cleanup function:

```js {7}
<ViewTransition
  onEnter={(instance) => {
    const anim = instance.new.animate(
      SLIDE_IN,
      {duration: 500, easing: 'ease-out'}
    );
    return () => anim.cancel();
  }}
>
```

This allows the browser to cancel the animation when the View Transition is interrupted.

</Note>

---

### Animating transition types with JavaScript {/_animating-transition-types-with-javascript_/}

You can use `types` passed to `ViewTransition` events to conditionally apply different animations based on how the Transition was triggered.

```js {3}
 <ViewTransition
  onEnter={(instance, types) => {
    const duration = types.includes('fast') ? 150 : 2000;
    const anim = instance.new.animate(
      SLIDE_IN,
      {duration: duration, easing: 'ease-out'}
    );
    return () => anim.cancel();
  }}
>
```

This example calls [`addTransitionType`](/reference/react/addTransitionType) to mark a Transition as "fast" and then adjust the animation duration:

<Sandpack>

```js src/Video.js hidden
function Thumbnail({ video, children }) {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className={`thumbnail ${video.image}`}
    />
  )
}

export function Video({ video }) {
  return (
    <div className="video">
      <div className="link">
        <Thumbnail video={video}></Thumbnail>

        <div className="info">
          <div className="video-title">{video.title}</div>
          <div className="video-description">{video.description}</div>
        </div>
      </div>
    </div>
  )
}
```

```js
import {
  ViewTransition,
  useState,
  startTransition,
  addTransitionType,
} from 'react'
import { Video } from './Video'
import videos from './data'
import { SLIDE_IN, SLIDE_OUT } from './animations'

function Item() {
  return (
    <ViewTransition
      onEnter={(instance, types) => {
        const duration = types.includes('fast') ? 150 : 2000
        const anim = instance.new.animate(SLIDE_IN, {
          duration: duration,
          easing: 'ease-out',
        })
        return () => anim.cancel()
      }}
      onExit={(instance, types) => {
        const duration = types.includes('fast') ? 150 : 500
        const anim = instance.old.animate(SLIDE_OUT, {
          duration: duration,
          easing: 'ease-in',
        })
        return () => anim.cancel()
      }}
    >
      <Video video={videos[0]} />
    </ViewTransition>
  )
}

export default function Component() {
  const [showItem, setShowItem] = useState(false)
  const [isFast, setIsFast] = useState(false)
  return (
    <>
      <div>
        Fast:{' '}
        <input
          type="checkbox"
          onChange={() => {
            setIsFast((f) => !f)
          }}
          value={isFast}
        ></input>
      </div>
      <br />
      <button
        onClick={() => {
          startTransition(() => {
            if (isFast) {
              addTransitionType('fast')
            }
            setShowItem((prev) => !prev)
          })
        }}
      >
        {showItem ? '➖' : '➕'}
      </button>

      {showItem ? <Item /> : null}
    </>
  )
}
```

```js src/animations.js
export const SLIDE_IN = [
  { opacity: 0, transform: 'translateY(20px)' },
  { opacity: 1, transform: 'translateY(0)' },
]

export const SLIDE_OUT = [
  { opacity: 1, transform: 'translateY(0)' },
  { opacity: 0, transform: 'translateY(-20px)' },
]
```

```js src/data.js hidden
export default [
  {
    id: '1',
    title: 'First video',
    description: 'Video description',
    image: 'blue',
  },
]
```

```css
#root {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 200px;
}
button {
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f8ff;
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition:
    background-color 0.3s,
    border 0.3s;
}
button:hover {
  border: 2px solid #ccc;
  background-color: #e0e8ff;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16 / 9;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 0.5rem;
  outline-offset: 2px;
  width: 8rem;
  vertical-align: middle;
  background-color: #ffffff;
  background-size: cover;
  user-select: none;
}
.thumbnail.blue {
  background-image: conic-gradient(at top right, #c76a15, #087ea4, #2b3491);
}
.video {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1em;
}
.video .link {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  gap: 0.125rem;
  outline-offset: 4px;
  cursor: pointer;
}
.video .info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 8px;
  gap: 0.125rem;
}
.video .info:hover {
  text-decoration: underline;
}
.video-title {
  font-size: 15px;
  line-height: 1.25;
  font-weight: 700;
  color: #23272f;
}
.video-description {
  color: #5e687e;
  font-size: 13px;
}
```

```json package.json hidden
{
  "dependencies": {
    "react": "canary",
    "react-dom": "canary",
    "react-scripts": "latest"
  }
}
```

</Sandpack>

---

### Building View Transition enabled routers {/_building-view-transition-enabled-routers_/}

React waits for any pending Navigation to finish to ensure that scroll restoration happens within the animation. If the Navigation is blocked on React, your router must unblock in `useLayoutEffect` since `useEffect` would lead to a deadlock.

If a `startTransition` is started from the legacy popstate event, such as during a "back"-navigation then it must finish synchronously to ensure scroll and form restoration works correctly. This is in conflict with running a View Transition animation. Therefore, React will skip animations from popstate and animations won't run for the back button. You can fix this by upgrading your router to use the Navigation API.

---

## Troubleshooting {/_troubleshooting_/}

### My `<ViewTransition>` is not activating {/_my-viewtransition-is-not-activating_/}

`<ViewTransition>` only activates if it is placed before any DOM node:

```js [3, 5]
function Component() {
  return (
    <div>
      <ViewTransition>Hi</ViewTransition>
    </div>
  )
}
```

To fix, ensure that the `<ViewTransition>` comes before any other DOM nodes:

```js [3, 5]
function Component() {
  return (
    <ViewTransition>
      <div>Hi</div>
    </ViewTransition>
  )
}
```

### I'm getting an error "There are two `<ViewTransition name=%s>` components with the same name mounted at the same time." {/_two-viewtransition-with-same-name_/}

This error occurs when two `<ViewTransition>` components with the same `name` are mounted at the same time:

```js [3]
function Item() {
  // 🚩 All items will get the same "name".
  return <ViewTransition name="item">...</ViewTransition>
}

function ItemList({ items }) {
  return (
    <>
      {items.map((item) => (
        <Item key={item.id} />
      ))}
    </>
  )
}
```

This will cause the View Transition to error. In development, React detects this issue to surface it and logs two errors:

<ConsoleBlockMulti>
<ConsoleLogLine level="error">

There are two `<ViewTransition name=%s>` components with the same name mounted at the same time. This is not supported and will cause View Transitions to error. Try to use a more unique name e.g. by using a namespace prefix and adding the id of an item to the name.
{' '}at Item
{' '}at ItemList

</ConsoleLogLine>

<ConsoleLogLine level="error">

The existing `<ViewTransition name=%s>` duplicate has this stack trace.
{' '}at Item
{' '}at ItemList

</ConsoleLogLine>
</ConsoleBlockMulti>

To fix, ensure that there's only one `<ViewTransition>` with the same name mounted at a time in the entire app by ensuring the `name` is unique, or adding an `id` to the name:

```js [3]
function Item({ id }) {
  // ✅ All items will get a unique name.
  return <ViewTransition name={`item-${id}`}>...</ViewTransition>
}

function ItemList({ items }) {
  return (
    <>
      {items.map((item) => (
        <Item key={item.id} item={item} />
      ))}
    </>
  )
}
```
