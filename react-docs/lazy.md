---
title: lazy
---

<Intro>

`lazy` lets you defer loading component's code until it is rendered for the first time.

```js
const SomeComponent = lazy(load)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `lazy(load)` {/_lazy_/}

Call `lazy` outside your components to declare a lazy-loaded React component:

```js
import { lazy } from 'react'

const MarkdownPreview = lazy(() => import('./MarkdownPreview.js'))
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `load`: A function that returns a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) or another _thenable_ (a Promise-like object with a `then` method). React will not call `load` until the first time you attempt to render the returned component. After React first calls `load`, it will wait for it to resolve, and then render the resolved value's `.default` as a React component. Both the returned Promise and the Promise's resolved value will be cached, so React will not call `load` more than once. If the Promise rejects, React will `throw` the rejection reason for the nearest Error Boundary to handle.

#### Returns {/_returns_/}

`lazy` returns a React component you can render in your tree. While the code for the lazy component is still loading, attempting to render it will _suspend._ Use [`<Suspense>`](/reference/react/Suspense) to display a loading indicator while it's loading.

---

### `load` function {/_load_/}

#### Parameters {/_load-parameters_/}

`load` receives no parameters.

#### Returns {/_load-returns_/}

You need to return a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) or some other _thenable_ (a Promise-like object with a `then` method). It needs to eventually resolve to an object whose `.default` property is a valid React component type, such as a function, [`memo`](/reference/react/memo), or a [`forwardRef`](/reference/react/forwardRef) component.

---

## Usage {/_usage_/}

### Lazy-loading components with Suspense {/_suspense-for-code-splitting_/}

Usually, you import components with the static [`import`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import) declaration:

```js
import MarkdownPreview from './MarkdownPreview.js'
```

To defer loading this component's code until it's rendered for the first time, replace this import with:

```js
import { lazy } from 'react'

const MarkdownPreview = lazy(() => import('./MarkdownPreview.js'))
```

This code relies on [dynamic `import()`,](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) which might require support from your bundler or framework. Using this pattern requires that the lazy component you're importing was exported as the `default` export.

Now that your component's code loads on demand, you also need to specify what should be displayed while it is loading. You can do this by wrapping the lazy component or any of its parents into a [`<Suspense>`](/reference/react/Suspense) boundary:

```js {1,4}
<Suspense fallback={<Loading />}>
  <h2>Preview</h2>
  <MarkdownPreview />
</Suspense>
```

In this example, the code for `MarkdownPreview` won't be loaded until you attempt to render it. If `MarkdownPreview` hasn't loaded yet, `Loading` will be shown in its place. Try ticking the checkbox:

<Sandpack>

```js src/App.js
import { useState, Suspense, lazy } from 'react'
import Loading from './Loading.js'

const MarkdownPreview = lazy(() => delayForDemo(import('./MarkdownPreview.js')))

export default function MarkdownEditor() {
  const [showPreview, setShowPreview] = useState(false)
  const [markdown, setMarkdown] = useState('Hello, **world**!')
  return (
    <>
      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={showPreview}
          onChange={(e) => setShowPreview(e.target.checked)}
        />
        Show preview
      </label>
      <hr />
      {showPreview && (
        <Suspense fallback={<Loading />}>
          <h2>Preview</h2>
          <MarkdownPreview markdown={markdown} />
        </Suspense>
      )}
    </>
  )
}

// Add a fixed delay so you can see the loading state
function delayForDemo(promise) {
  return new Promise((resolve) => {
    setTimeout(resolve, 2000)
  }).then(() => promise)
}
```

```js src/Loading.js
export default function Loading() {
  return (
    <p>
      <i>Loading...</i>
    </p>
  )
}
```

```js src/MarkdownPreview.js
import { Remarkable } from 'remarkable'

const md = new Remarkable()

export default function MarkdownPreview({ markdown }) {
  return (
    <div
      className="content"
      dangerouslySetInnerHTML={{ __html: md.render(markdown) }}
    />
  )
}
```

```json package.json hidden
{
  "dependencies": {
    "immer": "1.7.3",
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

```css
label {
  display: block;
}

input,
textarea {
  margin-bottom: 10px;
}

body {
  min-height: 200px;
}
```

</Sandpack>

This demo loads with an artificial delay. The next time you untick and tick the checkbox, `Preview` will be cached, so there will be no loading state. To see the loading state again, click "Reset" on the sandbox.

[Learn more about managing loading states with Suspense.](/reference/react/Suspense)

---

## Troubleshooting {/_troubleshooting_/}

### My `lazy` component's state gets reset unexpectedly {/_my-lazy-components-state-gets-reset-unexpectedly_/}

Do not declare `lazy` components _inside_ other components:

```js {4-5}
import { lazy } from 'react'

function Editor() {
  // 🔴 Bad: This will cause all state to be reset on re-renders
  const MarkdownPreview = lazy(() => import('./MarkdownPreview.js'))
  // ...
}
```

Instead, always declare them at the top level of your module:

```js {3-4}
import { lazy } from 'react'

// ✅ Good: Declare lazy components outside of your components
const MarkdownPreview = lazy(() => import('./MarkdownPreview.js'))

function Editor() {
  // ...
}
```
