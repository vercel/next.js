---
title: useImperativeHandle
---

<Intro>

`useImperativeHandle` is a React Hook that lets you customize the handle exposed as a [ref.](/learn/manipulating-the-dom-with-refs)

```js
useImperativeHandle(ref, createHandle, dependencies?)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useImperativeHandle(ref, createHandle, dependencies?)` {/_useimperativehandle_/}

Call `useImperativeHandle` at the top level of your component to customize the ref handle it exposes:

```js
import { useImperativeHandle } from 'react';

function MyInput({ ref }) {
  useImperativeHandle(ref, () => {
    return {
      // ... your methods ...
    };
  }, []);
  // ...
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `ref`: The `ref` you received as a prop to the `MyInput` component.

- `createHandle`: A function that takes no arguments and returns the ref handle you want to expose. That ref handle can have any type. Usually, you will return an object with the methods you want to expose.

- **optional** `dependencies`: The list of all reactive values referenced inside of the `createHandle` code. Reactive values include props, state, and all the variables and functions declared directly inside your component body. If your linter is [configured for React](/learn/editor-setup#linting), it will verify that every reactive value is correctly specified as a dependency. The list of dependencies must have a constant number of items and be written inline like `[dep1, dep2, dep3]`. React will compare each dependency with its previous value using the [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) comparison. If a re-render resulted in a change to some dependency, or if you omitted this argument, your `createHandle` function will re-execute, and the newly created handle will be assigned to the ref.

<Note>

Starting with React 19, [`ref` is available as a prop.](/blog/2024/12/05/react-19#ref-as-a-prop) In React 18 and earlier, it was necessary to get the `ref` from [`forwardRef`.](/reference/react/forwardRef)

</Note>

#### Returns {/_returns_/}

`useImperativeHandle` returns `undefined`.

---

## Usage {/_usage_/}

### Exposing a custom ref handle to the parent component {/_exposing-a-custom-ref-handle-to-the-parent-component_/}

To expose a DOM node to the parent element, pass in the `ref` prop to the node.

```js {2}
function MyInput({ ref }) {
  return <input ref={ref} />
}
```

With the code above, [a ref to `MyInput` will receive the `<input>` DOM node.](/learn/manipulating-the-dom-with-refs) However, you can expose a custom value instead. To customize the exposed handle, call `useImperativeHandle` at the top level of your component:

```js {4-8}
import { useImperativeHandle } from 'react'

function MyInput({ ref }) {
  useImperativeHandle(ref, () => {
    return {
      // ... your methods ...
    }
  }, [])

  return <input />
}
```

Note that in the code above, the `ref` is no longer passed to the `<input>`.

For example, suppose you don't want to expose the entire `<input>` DOM node, but you want to expose two of its methods: `focus` and `scrollIntoView`. To do this, keep the real browser DOM in a separate ref. Then use `useImperativeHandle` to expose a handle with only the methods that you want the parent component to call:

```js {7-14}
import { useRef, useImperativeHandle } from 'react'

function MyInput({ ref }) {
  const inputRef = useRef(null)

  useImperativeHandle(ref, () => {
    return {
      focus() {
        inputRef.current.focus()
      },
      scrollIntoView() {
        inputRef.current.scrollIntoView()
      },
    }
  }, [])

  return <input ref={inputRef} />
}
```

Now, if the parent component gets a ref to `MyInput`, it will be able to call the `focus` and `scrollIntoView` methods on it. However, it will not have full access to the underlying `<input>` DOM node.

<Sandpack>

```js
import { useRef } from 'react'
import MyInput from './MyInput.js'

export default function Form() {
  const ref = useRef(null)

  function handleClick() {
    ref.current.focus()
    // This won't work because the DOM node isn't exposed:
    // ref.current.style.opacity = 0.5;
  }

  return (
    <form>
      <MyInput placeholder="Enter your name" ref={ref} />
      <button type="button" onClick={handleClick}>
        Edit
      </button>
    </form>
  )
}
```

```js src/MyInput.js
import { useRef, useImperativeHandle } from 'react'

function MyInput({ ref, ...props }) {
  const inputRef = useRef(null)

  useImperativeHandle(ref, () => {
    return {
      focus() {
        inputRef.current.focus()
      },
      scrollIntoView() {
        inputRef.current.scrollIntoView()
      },
    }
  }, [])

  return <input {...props} ref={inputRef} />
}

export default MyInput
```

```css
input {
  margin: 5px;
}
```

</Sandpack>

---

### Exposing your own imperative methods {/_exposing-your-own-imperative-methods_/}

The methods you expose via an imperative handle don't have to match the DOM methods exactly. For example, this `Post` component exposes a `scrollAndFocusAddComment` method via an imperative handle. This lets the parent `Page` scroll the list of comments _and_ focus the input field when you click the button:

<Sandpack>

```js
import { useRef } from 'react'
import Post from './Post.js'

export default function Page() {
  const postRef = useRef(null)

  function handleClick() {
    postRef.current.scrollAndFocusAddComment()
  }

  return (
    <>
      <button onClick={handleClick}>Write a comment</button>
      <Post ref={postRef} />
    </>
  )
}
```

```js src/Post.js
import { useRef, useImperativeHandle } from 'react'
import CommentList from './CommentList.js'
import AddComment from './AddComment.js'

function Post({ ref }) {
  const commentsRef = useRef(null)
  const addCommentRef = useRef(null)

  useImperativeHandle(ref, () => {
    return {
      scrollAndFocusAddComment() {
        commentsRef.current.scrollToBottom()
        addCommentRef.current.focus()
      },
    }
  }, [])

  return (
    <>
      <article>
        <p>Welcome to my blog!</p>
      </article>
      <CommentList ref={commentsRef} />
      <AddComment ref={addCommentRef} />
    </>
  )
}

export default Post
```

```js src/CommentList.js
import { useRef, useImperativeHandle } from 'react'

function CommentList({ ref }) {
  const divRef = useRef(null)

  useImperativeHandle(ref, () => {
    return {
      scrollToBottom() {
        const node = divRef.current
        node.scrollTop = node.scrollHeight
      },
    }
  }, [])

  let comments = []
  for (let i = 0; i < 50; i++) {
    comments.push(<p key={i}>Comment #{i}</p>)
  }

  return (
    <div className="CommentList" ref={divRef}>
      {comments}
    </div>
  )
}

export default CommentList
```

```js src/AddComment.js
import { useRef, useImperativeHandle } from 'react'

function AddComment({ ref }) {
  return <input placeholder="Add comment..." ref={ref} />
}

export default AddComment
```

```css
.CommentList {
  height: 100px;
  overflow: scroll;
  border: 1px solid black;
  margin-top: 20px;
  margin-bottom: 20px;
}
```

</Sandpack>

<Pitfall>

**Do not overuse refs.** You should only use refs for _imperative_ behaviors that you can't express as props: for example, scrolling to a node, focusing a node, triggering an animation, selecting text, and so on.

**If you can express something as a prop, you should not use a ref.** For example, instead of exposing an imperative handle like `{ open, close }` from a `Modal` component, it is better to take `isOpen` as a prop like `<Modal isOpen={isOpen} />`. [Effects](/learn/synchronizing-with-effects) can help you expose imperative behaviors via props.

</Pitfall>
