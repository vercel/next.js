---
title: useRef
---

<Intro>

`useRef` is a React Hook that lets you reference a value that's not needed for rendering.

```js
const ref = useRef(initialValue)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useRef(initialValue)` {/_useref_/}

Call `useRef` at the top level of your component to declare a [ref.](/learn/referencing-values-with-refs)

```js
import { useRef } from 'react';

function MyComponent() {
  const intervalRef = useRef(0);
  const inputRef = useRef(null);
  // ...
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `initialValue`: The value you want the ref object's `current` property to be initially. It can be a value of any type. This argument is ignored after the initial render.

#### Returns {/_returns_/}

`useRef` returns an object with a single property:

- `current`: Initially, it's set to the `initialValue` you have passed. You can later set it to something else. If you pass the ref object to React as a `ref` attribute to a JSX node, React will set its `current` property.

On the next renders, `useRef` will return the same object.

#### Caveats {/_caveats_/}

- You can mutate the `ref.current` property. Unlike state, it is mutable. However, if it holds an object that is used for rendering (for example, a piece of your state), then you shouldn't mutate that object.
- When you change the `ref.current` property, React does not re-render your component. React is not aware of when you change it because a ref is a plain JavaScript object.
- Do not write _or read_ `ref.current` during rendering, except for [initialization.](#avoiding-recreating-the-ref-contents) This makes your component's behavior unpredictable.
- In Strict Mode, React will **call your component function twice** in order to [help you find accidental impurities.](/reference/react/useState#my-initializer-or-updater-function-runs-twice) This is development-only behavior and does not affect production. Each ref object will be created twice, but one of the versions will be discarded. If your component function is pure (as it should be), this should not affect the behavior.

---

## Usage {/_usage_/}

### Referencing a value with a ref {/_referencing-a-value-with-a-ref_/}

Call `useRef` at the top level of your component to declare one or more [refs.](/learn/referencing-values-with-refs)

```js [[1, 4, "intervalRef"], [3, 4, "0"]]
import { useRef } from 'react';

function Stopwatch() {
  const intervalRef = useRef(0);
  // ...
```

`useRef` returns a <CodeStep step={1}>ref object</CodeStep> with a single <CodeStep step={2}>`current` property</CodeStep> initially set to the <CodeStep step={3}>initial value</CodeStep> you provided.

On the next renders, `useRef` will return the same object. You can change its `current` property to store information and read it later. This might remind you of [state](/reference/react/useState), but there is an important difference.

**Changing a ref does not trigger a re-render.** This means refs are perfect for storing information that doesn't affect the visual output of your component. For example, if you need to store an [interval ID](https://developer.mozilla.org/en-US/docs/Web/API/setInterval) and retrieve it later, you can put it in a ref. To update the value inside the ref, you need to manually change its <CodeStep step={2}>`current` property</CodeStep>:

```js [[2, 5, "intervalRef.current"]]
function handleStartClick() {
  const intervalId = setInterval(() => {
    // ...
  }, 1000)
  intervalRef.current = intervalId
}
```

Later, you can read that interval ID from the ref so that you can call [clear that interval](https://developer.mozilla.org/en-US/docs/Web/API/clearInterval):

```js [[2, 2, "intervalRef.current"]]
function handleStopClick() {
  const intervalId = intervalRef.current
  clearInterval(intervalId)
}
```

By using a ref, you ensure that:

- You can **store information** between re-renders (unlike regular variables, which reset on every render).
- Changing it **does not trigger a re-render** (unlike state variables, which trigger a re-render).
- The **information is local** to each copy of your component (unlike the variables outside, which are shared).

Changing a ref does not trigger a re-render, so refs are not appropriate for storing information you want to display on the screen. Use state for that instead. Read more about [choosing between `useRef` and `useState`.](/learn/referencing-values-with-refs#differences-between-refs-and-state)

<Recipes titleText="Examples of referencing a value with useRef" titleId="examples-value">

#### Click counter {/_click-counter_/}

This component uses a ref to keep track of how many times the button was clicked. Note that it's okay to use a ref instead of state here because the click count is only read and written in an event handler.

<Sandpack>

```js
import { useRef } from 'react'

export default function Counter() {
  let ref = useRef(0)

  function handleClick() {
    ref.current = ref.current + 1
    alert('You clicked ' + ref.current + ' times!')
  }

  return <button onClick={handleClick}>Click me!</button>
}
```

</Sandpack>

If you show `{ref.current}` in the JSX, the number won't update on click. This is because setting `ref.current` does not trigger a re-render. Information that's used for rendering should be state instead.

<Solution />

#### A stopwatch {/_a-stopwatch_/}

This example uses a combination of state and refs. Both `startTime` and `now` are state variables because they are used for rendering. But we also need to hold an [interval ID](https://developer.mozilla.org/en-US/docs/Web/API/setInterval) so that we can stop the interval on button press. Since the interval ID is not used for rendering, it's appropriate to keep it in a ref, and manually update it.

<Sandpack>

```js
import { useState, useRef } from 'react'

export default function Stopwatch() {
  const [startTime, setStartTime] = useState(null)
  const [now, setNow] = useState(null)
  const intervalRef = useRef(null)

  function handleStart() {
    setStartTime(Date.now())
    setNow(Date.now())

    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setNow(Date.now())
    }, 10)
  }

  function handleStop() {
    clearInterval(intervalRef.current)
  }

  let secondsPassed = 0
  if (startTime != null && now != null) {
    secondsPassed = (now - startTime) / 1000
  }

  return (
    <>
      <h1>Time passed: {secondsPassed.toFixed(3)}</h1>
      <button onClick={handleStart}>Start</button>
      <button onClick={handleStop}>Stop</button>
    </>
  )
}
```

</Sandpack>

<Solution />

</Recipes>

<Pitfall>

**Do not write _or read_ `ref.current` during rendering.**

React expects that the body of your component [behaves like a pure function](/learn/keeping-components-pure):

- If the inputs ([props](/learn/passing-props-to-a-component), [state](/learn/state-a-components-memory), and [context](/learn/passing-data-deeply-with-context)) are the same, it should return exactly the same JSX.
- Calling it in a different order or with different arguments should not affect the results of other calls.

Reading or writing a ref **during rendering** breaks these expectations.

```js {expectedErrors: {'react-compiler': [4]}} {3-4,6-7}
function MyComponent() {
  // ...
  // 🚩 Don't write a ref during rendering
  myRef.current = 123
  // ...
  // 🚩 Don't read a ref during rendering
  return <h1>{myOtherRef.current}</h1>
}
```

You can read or write refs **from event handlers or effects instead**.

```js {4-5,9-10}
function MyComponent() {
  // ...
  useEffect(() => {
    // ✅ You can read or write refs in effects
    myRef.current = 123
  })
  // ...
  function handleClick() {
    // ✅ You can read or write refs in event handlers
    doSomething(myOtherRef.current)
  }
  // ...
}
```

If you _have to_ read [or write](/reference/react/useState#storing-information-from-previous-renders) something during rendering, [use state](/reference/react/useState) instead.

When you break these rules, your component might still work, but most of the newer features we're adding to React will rely on these expectations. Read more about [keeping your components pure.](/learn/keeping-components-pure#where-you-_can_-cause-side-effects)

</Pitfall>

---

### Manipulating the DOM with a ref {/_manipulating-the-dom-with-a-ref_/}

It's particularly common to use a ref to manipulate the [DOM.](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API) React has built-in support for this.

First, declare a <CodeStep step={1}>ref object</CodeStep> with an <CodeStep step={3}>initial value</CodeStep> of `null`:

```js [[1, 4, "inputRef"], [3, 4, "null"]]
import { useRef } from 'react';

function MyComponent() {
  const inputRef = useRef(null);
  // ...
```

Then pass your ref object as the `ref` attribute to the JSX of the DOM node you want to manipulate:

```js [[1, 2, "inputRef"]]
// ...
return <input ref={inputRef} />
```

After React creates the DOM node and puts it on the screen, React will set the <CodeStep step={2}>`current` property</CodeStep> of your ref object to that DOM node. Now you can access the `<input>`'s DOM node and call methods like [`focus()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus):

```js [[2, 2, "inputRef.current"]]
function handleClick() {
  inputRef.current.focus()
}
```

React will set the `current` property back to `null` when the node is removed from the screen.

Read more about [manipulating the DOM with refs.](/learn/manipulating-the-dom-with-refs)

<Recipes titleText="Examples of manipulating the DOM with useRef" titleId="examples-dom">

#### Focusing a text input {/_focusing-a-text-input_/}

In this example, clicking the button will focus the input:

<Sandpack>

```js
import { useRef } from 'react'

export default function Form() {
  const inputRef = useRef(null)

  function handleClick() {
    inputRef.current.focus()
  }

  return (
    <>
      <input ref={inputRef} />
      <button onClick={handleClick}>Focus the input</button>
    </>
  )
}
```

</Sandpack>

<Solution />

#### Scrolling an image into view {/_scrolling-an-image-into-view_/}

In this example, clicking the button will scroll an image into view. It uses a ref to the list DOM node, and then calls DOM [`querySelectorAll`](https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll) API to find the image we want to scroll to.

<Sandpack>

```js
import { useRef } from 'react'

export default function CatFriends() {
  const listRef = useRef(null)

  function scrollToIndex(index) {
    const listNode = listRef.current
    // This line assumes a particular DOM structure:
    const imgNode = listNode.querySelectorAll('li > img')[index]
    imgNode.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }

  return (
    <>
      <nav>
        <button onClick={() => scrollToIndex(0)}>Neo</button>
        <button onClick={() => scrollToIndex(1)}>Millie</button>
        <button onClick={() => scrollToIndex(2)}>Bella</button>
      </nav>
      <div>
        <ul ref={listRef}>
          <li>
            <img src="https://placecats.com/neo/300/200" alt="Neo" />
          </li>
          <li>
            <img src="https://placecats.com/millie/200/200" alt="Millie" />
          </li>
          <li>
            <img src="https://placecats.com/bella/199/200" alt="Bella" />
          </li>
        </ul>
      </div>
    </>
  )
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

<Solution />

#### Playing and pausing a video {/_playing-and-pausing-a-video_/}

This example uses a ref to call [`play()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play) and [`pause()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/pause) on a `<video>` DOM node.

<Sandpack>

```js
import { useState, useRef } from 'react'

export default function VideoPlayer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const ref = useRef(null)

  function handleClick() {
    const nextIsPlaying = !isPlaying
    setIsPlaying(nextIsPlaying)

    if (nextIsPlaying) {
      ref.current.play()
    } else {
      ref.current.pause()
    }
  }

  return (
    <>
      <button onClick={handleClick}>{isPlaying ? 'Pause' : 'Play'}</button>
      <video
        width="250"
        ref={ref}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      >
        <source
          src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
          type="video/mp4"
        />
      </video>
    </>
  )
}
```

```css
button {
  display: block;
  margin-bottom: 20px;
}
```

</Sandpack>

<Solution />

#### Exposing a ref to your own component {/_exposing-a-ref-to-your-own-component_/}

Sometimes, you may want to let the parent component manipulate the DOM inside of your component. For example, maybe you're writing a `MyInput` component, but you want the parent to be able to focus the input (which the parent has no access to). You can create a `ref` in the parent and pass the `ref` as prop to the child component. Read a [detailed walkthrough](/learn/manipulating-the-dom-with-refs#accessing-another-components-dom-nodes) here.

<Sandpack>

```js
import { useRef } from 'react'

function MyInput({ ref }) {
  return <input ref={ref} />
}

export default function Form() {
  const inputRef = useRef(null)

  function handleClick() {
    inputRef.current.focus()
  }

  return (
    <>
      <MyInput ref={inputRef} />
      <button onClick={handleClick}>Focus the input</button>
    </>
  )
}
```

</Sandpack>

<Solution />

</Recipes>

---

### Avoiding recreating the ref contents {/_avoiding-recreating-the-ref-contents_/}

React saves the initial ref value once and ignores it on the next renders.

```js
function Video() {
  const playerRef = useRef(new VideoPlayer());
  // ...
```

Although the result of `new VideoPlayer()` is only used for the initial render, you're still calling this function on every render. This can be wasteful if it's creating expensive objects.

To solve it, you may initialize the ref like this instead:

```js
function Video() {
  const playerRef = useRef(null);
  if (playerRef.current === null) {
    playerRef.current = new VideoPlayer();
  }
  // ...
```

Normally, writing or reading `ref.current` during render is not allowed. However, it's fine in this case because the result is always the same, and the condition only executes during initialization so it's fully predictable.

<DeepDive>

#### How to avoid null checks when initializing useRef later {/_how-to-avoid-null-checks-when-initializing-use-ref-later_/}

If you use a type checker and don't want to always check for `null`, you can try a pattern like this instead:

```js
function Video() {
  const playerRef = useRef(null);

  function getPlayer() {
    if (playerRef.current !== null) {
      return playerRef.current;
    }
    const player = new VideoPlayer();
    playerRef.current = player;
    return player;
  }

  // ...
```

Here, the `playerRef` itself is nullable. However, you should be able to convince your type checker that there is no case in which `getPlayer()` returns `null`. Then use `getPlayer()` in your event handlers.

</DeepDive>

---

## Troubleshooting {/_troubleshooting_/}

### I can't get a ref to a custom component {/_i-cant-get-a-ref-to-a-custom-component_/}

If you try to pass a `ref` to your own component like this:

```js
const inputRef = useRef(null)

return <MyInput ref={inputRef} />
```

You might get an error in the console:

<ConsoleBlock level="error">

TypeError: Cannot read properties of null

</ConsoleBlock>

By default, your own components don't expose refs to the DOM nodes inside them.

To fix this, find the component that you want to get a ref to:

```js
export default function MyInput({ value, onChange }) {
  return <input value={value} onChange={onChange} />
}
```

And then add `ref` to the list of props your component accepts and pass `ref` as a prop to the relevant child [built-in component](/reference/react-dom/components/common) like this:

```js {1,6}
function MyInput({ value, onChange, ref }) {
  return <input value={value} onChange={onChange} ref={ref} />
}

export default MyInput
```

Then the parent component can get a ref to it.

Read more about [accessing another component's DOM nodes.](/learn/manipulating-the-dom-with-refs#accessing-another-components-dom-nodes)
