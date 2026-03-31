---
title: useCallback
---

<Intro>

`useCallback` is a React Hook that lets you cache a function definition between re-renders.

```js
const cachedFn = useCallback(fn, dependencies)
```

</Intro>

<Note>

[React Compiler](/learn/react-compiler) automatically memoizes values and functions, reducing the need for manual `useCallback` calls. You can use the compiler to handle memoization automatically.

</Note>

<InlineToc />

---

## Reference {/_reference_/}

### `useCallback(fn, dependencies)` {/_usecallback_/}

Call `useCallback` at the top level of your component to cache a function definition between re-renders:

```js {4,9}
import { useCallback } from 'react';

export default function ProductPage({ productId, referrer, theme }) {
  const handleSubmit = useCallback((orderDetails) => {
    post('/product/' + productId + '/buy', {
      referrer,
      orderDetails,
    });
  }, [productId, referrer]);
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `fn`: The function value that you want to cache. It can take any arguments and return any values. React will return (not call!) your function back to you during the initial render. On next renders, React will give you the same function again if the `dependencies` have not changed since the last render. Otherwise, it will give you the function that you have passed during the current render, and store it in case it can be reused later. React will not call your function. The function is returned to you so you can decide when and whether to call it.

- `dependencies`: The list of all reactive values referenced inside of the `fn` code. Reactive values include props, state, and all the variables and functions declared directly inside your component body. If your linter is [configured for React](/learn/editor-setup#linting), it will verify that every reactive value is correctly specified as a dependency. The list of dependencies must have a constant number of items and be written inline like `[dep1, dep2, dep3]`. React will compare each dependency with its previous value using the [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) comparison algorithm.

#### Returns {/_returns_/}

On the initial render, `useCallback` returns the `fn` function you have passed.

During subsequent renders, it will either return an already stored `fn` function from the last render (if the dependencies haven't changed), or return the `fn` function you have passed during this render.

#### Caveats {/_caveats_/}

- `useCallback` is a Hook, so you can only call it **at the top level of your component** or your own Hooks. You can't call it inside loops or conditions. If you need that, extract a new component and move the state into it.
- React **will not throw away the cached function unless there is a specific reason to do that.** For example, in development, React throws away the cache when you edit the file of your component. Both in development and in production, React will throw away the cache if your component suspends during the initial mount. In the future, React may add more features that take advantage of throwing away the cache--for example, if React adds built-in support for virtualized lists in the future, it would make sense to throw away the cache for items that scroll out of the virtualized table viewport. This should match your expectations if you rely on `useCallback` as a performance optimization. Otherwise, a [state variable](/reference/react/useState#im-trying-to-set-state-to-a-function-but-it-gets-called-instead) or a [ref](/reference/react/useRef#avoiding-recreating-the-ref-contents) may be more appropriate.

---

## Usage {/_usage_/}

### Skipping re-rendering of components {/_skipping-re-rendering-of-components_/}

When you optimize rendering performance, you will sometimes need to cache the functions that you pass to child components. Let's first look at the syntax for how to do this, and then see in which cases it's useful.

To cache a function between re-renders of your component, wrap its definition into the `useCallback` Hook:

```js [[3, 4, "handleSubmit"], [2, 9, "[productId, referrer]"]]
import { useCallback } from 'react';

function ProductPage({ productId, referrer, theme }) {
  const handleSubmit = useCallback((orderDetails) => {
    post('/product/' + productId + '/buy', {
      referrer,
      orderDetails,
    });
  }, [productId, referrer]);
  // ...
```

You need to pass two things to `useCallback`:

1. A function definition that you want to cache between re-renders.
2. A <CodeStep step={2}>list of dependencies</CodeStep> including every value within your component that's used inside your function.

On the initial render, the <CodeStep step={3}>returned function</CodeStep> you'll get from `useCallback` will be the function you passed.

On the following renders, React will compare the <CodeStep step={2}>dependencies</CodeStep> with the dependencies you passed during the previous render. If none of the dependencies have changed (compared with [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is)), `useCallback` will return the same function as before. Otherwise, `useCallback` will return the function you passed on _this_ render.

In other words, `useCallback` caches a function between re-renders until its dependencies change.

**Let's walk through an example to see when this is useful.**

Say you're passing a `handleSubmit` function down from the `ProductPage` to the `ShippingForm` component:

```js {5}
function ProductPage({ productId, referrer, theme }) {
  // ...
  return (
    <div className={theme}>
      <ShippingForm onSubmit={handleSubmit} />
    </div>
  );
```

You've noticed that toggling the `theme` prop freezes the app for a moment, but if you remove `<ShippingForm />` from your JSX, it feels fast. This tells you that it's worth trying to optimize the `ShippingForm` component.

**By default, when a component re-renders, React re-renders all of its children recursively.** This is why, when `ProductPage` re-renders with a different `theme`, the `ShippingForm` component _also_ re-renders. This is fine for components that don't require much calculation to re-render. But if you verified a re-render is slow, you can tell `ShippingForm` to skip re-rendering when its props are the same as on last render by wrapping it in [`memo`:](/reference/react/memo)

```js {3,5}
import { memo } from 'react'

const ShippingForm = memo(function ShippingForm({ onSubmit }) {
  // ...
})
```

**With this change, `ShippingForm` will skip re-rendering if all of its props are the _same_ as on the last render.** This is when caching a function becomes important! Let's say you defined `handleSubmit` without `useCallback`:

```js {2,3,8,12-13}
function ProductPage({ productId, referrer, theme }) {
  // Every time the theme changes, this will be a different function...
  function handleSubmit(orderDetails) {
    post('/product/' + productId + '/buy', {
      referrer,
      orderDetails,
    })
  }

  return (
    <div className={theme}>
      {/* ... so ShippingForm's props will never be the same, and it will re-render every time */}
      <ShippingForm onSubmit={handleSubmit} />
    </div>
  )
}
```

**In JavaScript, a `function () {}` or `() => {}` always creates a _different_ function,** similar to how the `{}` object literal always creates a new object. Normally, this wouldn't be a problem, but it means that `ShippingForm` props will never be the same, and your [`memo`](/reference/react/memo) optimization won't work. This is where `useCallback` comes in handy:

```js {2,3,8,12-13}
function ProductPage({ productId, referrer, theme }) {
  // Tell React to cache your function between re-renders...
  const handleSubmit = useCallback(
    (orderDetails) => {
      post('/product/' + productId + '/buy', {
        referrer,
        orderDetails,
      })
    },
    [productId, referrer]
  ) // ...so as long as these dependencies don't change...

  return (
    <div className={theme}>
      {/* ...ShippingForm will receive the same props and can skip re-rendering */}
      <ShippingForm onSubmit={handleSubmit} />
    </div>
  )
}
```

**By wrapping `handleSubmit` in `useCallback`, you ensure that it's the _same_ function between the re-renders** (until dependencies change). You don't _have to_ wrap a function in `useCallback` unless you do it for some specific reason. In this example, the reason is that you pass it to a component wrapped in [`memo`,](/reference/react/memo) and this lets it skip re-rendering. There are other reasons you might need `useCallback` which are described further on this page.

<Note>

**You should only rely on `useCallback` as a performance optimization.** If your code doesn't work without it, find the underlying problem and fix it first. Then you may add `useCallback` back.

</Note>

<DeepDive>

#### How is useCallback related to useMemo? {/_how-is-usecallback-related-to-usememo_/}

You will often see [`useMemo`](/reference/react/useMemo) alongside `useCallback`. They are both useful when you're trying to optimize a child component. They let you [memoize](https://en.wikipedia.org/wiki/Memoization) (or, in other words, cache) something you're passing down:

```js {6-8,10-15,19}
import { useMemo, useCallback } from 'react'

function ProductPage({ productId, referrer }) {
  const product = useData('/product/' + productId)

  const requirements = useMemo(() => {
    // Calls your function and caches its result
    return computeRequirements(product)
  }, [product])

  const handleSubmit = useCallback(
    (orderDetails) => {
      // Caches your function itself
      post('/product/' + productId + '/buy', {
        referrer,
        orderDetails,
      })
    },
    [productId, referrer]
  )

  return (
    <div className={theme}>
      <ShippingForm requirements={requirements} onSubmit={handleSubmit} />
    </div>
  )
}
```

The difference is in _what_ they're letting you cache:

- **[`useMemo`](/reference/react/useMemo) caches the _result_ of calling your function.** In this example, it caches the result of calling `computeRequirements(product)` so that it doesn't change unless `product` has changed. This lets you pass the `requirements` object down without unnecessarily re-rendering `ShippingForm`. When necessary, React will call the function you've passed during rendering to calculate the result.
- **`useCallback` caches _the function itself._** Unlike `useMemo`, it does not call the function you provide. Instead, it caches the function you provided so that `handleSubmit` _itself_ doesn't change unless `productId` or `referrer` has changed. This lets you pass the `handleSubmit` function down without unnecessarily re-rendering `ShippingForm`. Your code won't run until the user submits the form.

If you're already familiar with [`useMemo`,](/reference/react/useMemo) you might find it helpful to think of `useCallback` as this:

```js {expectedErrors: {'react-compiler': [3]}}
// Simplified implementation (inside React)
function useCallback(fn, dependencies) {
  return useMemo(() => fn, dependencies)
}
```

[Read more about the difference between `useMemo` and `useCallback`.](/reference/react/useMemo#memoizing-a-function)

</DeepDive>

<DeepDive>

#### Should you add useCallback everywhere? {/_should-you-add-usecallback-everywhere_/}

If your app is like this site, and most interactions are coarse (like replacing a page or an entire section), memoization is usually unnecessary. On the other hand, if your app is more like a drawing editor, and most interactions are granular (like moving shapes), then you might find memoization very helpful.

Caching a function with `useCallback` is only valuable in a few cases:

- You pass it as a prop to a component wrapped in [`memo`.](/reference/react/memo) You want to skip re-rendering if the value hasn't changed. Memoization lets your component re-render only if dependencies changed.
- The function you're passing is later used as a dependency of some Hook. For example, another function wrapped in `useCallback` depends on it, or you depend on this function from [`useEffect.`](/reference/react/useEffect)

There is no benefit to wrapping a function in `useCallback` in other cases. There is no significant harm to doing that either, so some teams choose to not think about individual cases, and memoize as much as possible. The downside is that code becomes less readable. Also, not all memoization is effective: a single value that's "always new" is enough to break memoization for an entire component.

Note that `useCallback` does not prevent _creating_ the function. You're always creating a function (and that's fine!), but React ignores it and gives you back a cached function if nothing changed.

**In practice, you can make a lot of memoization unnecessary by following a few principles:**

1. When a component visually wraps other components, let it [accept JSX as children.](/learn/passing-props-to-a-component#passing-jsx-as-children) Then, if the wrapper component updates its own state, React knows that its children don't need to re-render.
2. Prefer local state and don't [lift state up](/learn/sharing-state-between-components) any further than necessary. Don't keep transient state like forms and whether an item is hovered at the top of your tree or in a global state library.
3. Keep your [rendering logic pure.](/learn/keeping-components-pure) If re-rendering a component causes a problem or produces some noticeable visual artifact, it's a bug in your component! Fix the bug instead of adding memoization.
4. Avoid [unnecessary Effects that update state.](/learn/you-might-not-need-an-effect) Most performance problems in React apps are caused by chains of updates originating from Effects that cause your components to render over and over.
5. Try to [remove unnecessary dependencies from your Effects.](/learn/removing-effect-dependencies) For example, instead of memoization, it's often simpler to move some object or a function inside an Effect or outside the component.

If a specific interaction still feels laggy, [use the React Developer Tools profiler](https://legacy.reactjs.org/blog/2018/09/10/introducing-the-react-profiler.html) to see which components benefit the most from memoization, and add memoization where needed. These principles make your components easier to debug and understand, so it's good to follow them in any case. In long term, we're researching [doing memoization automatically](https://www.youtube.com/watch?v=lGEMwh32soc) to solve this once and for all.

</DeepDive>

<Recipes titleText="The difference between useCallback and declaring a function directly" titleId="examples-rerendering">

#### Skipping re-rendering with `useCallback` and `memo` {/_skipping-re-rendering-with-usecallback-and-memo_/}

In this example, the `ShippingForm` component is **artificially slowed down** so that you can see what happens when a React component you're rendering is genuinely slow. Try incrementing the counter and toggling the theme.

Incrementing the counter feels slow because it forces the slowed down `ShippingForm` to re-render. That's expected because the counter has changed, and so you need to reflect the user's new choice on the screen.

Next, try toggling the theme. **Thanks to `useCallback` together with [`memo`](/reference/react/memo), it’s fast despite the artificial slowdown!** `ShippingForm` skipped re-rendering because the `handleSubmit` function has not changed. The `handleSubmit` function has not changed because both `productId` and `referrer` (your `useCallback` dependencies) haven't changed since last render.

<Sandpack>

```js src/App.js
import { useState } from 'react'
import ProductPage from './ProductPage.js'

export default function App() {
  const [isDark, setIsDark] = useState(false)
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={isDark}
          onChange={(e) => setIsDark(e.target.checked)}
        />
        Dark mode
      </label>
      <hr />
      <ProductPage
        referrerId="wizard_of_oz"
        productId={123}
        theme={isDark ? 'dark' : 'light'}
      />
    </>
  )
}
```

```js src/ProductPage.js active
import { useCallback } from 'react'
import ShippingForm from './ShippingForm.js'

export default function ProductPage({ productId, referrer, theme }) {
  const handleSubmit = useCallback(
    (orderDetails) => {
      post('/product/' + productId + '/buy', {
        referrer,
        orderDetails,
      })
    },
    [productId, referrer]
  )

  return (
    <div className={theme}>
      <ShippingForm onSubmit={handleSubmit} />
    </div>
  )
}

function post(url, data) {
  // Imagine this sends a request...
  console.log('POST /' + url)
  console.log(data)
}
```

```js {expectedErrors: {'react-compiler': [7, 8]}} src/ShippingForm.js
import { memo, useState } from 'react'

const ShippingForm = memo(function ShippingForm({ onSubmit }) {
  const [count, setCount] = useState(1)

  console.log('[ARTIFICIALLY SLOW] Rendering <ShippingForm />')
  let startTime = performance.now()
  while (performance.now() - startTime < 500) {
    // Do nothing for 500 ms to emulate extremely slow code
  }

  function handleSubmit(e) {
    e.preventDefault()
    const formData = new FormData(e.target)
    const orderDetails = {
      ...Object.fromEntries(formData),
      count,
    }
    onSubmit(orderDetails)
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>
        <b>
          Note: <code>ShippingForm</code> is artificially slowed down!
        </b>
      </p>
      <label>
        Number of items:
        <button type="button" onClick={() => setCount(count - 1)}>
          –
        </button>
        {count}
        <button type="button" onClick={() => setCount(count + 1)}>
          +
        </button>
      </label>
      <label>
        Street:
        <input name="street" />
      </label>
      <label>
        City:
        <input name="city" />
      </label>
      <label>
        Postal code:
        <input name="zipCode" />
      </label>
      <button type="submit">Submit</button>
    </form>
  )
})

export default ShippingForm
```

```css
label {
  display: block;
  margin-top: 10px;
}

input {
  margin-left: 5px;
}

button[type='button'] {
  margin: 5px;
}

.dark {
  background-color: black;
  color: white;
}

.light {
  background-color: white;
  color: black;
}
```

</Sandpack>

<Solution />

#### Always re-rendering a component {/_always-re-rendering-a-component_/}

In this example, the `ShippingForm` implementation is also **artificially slowed down** so that you can see what happens when some React component you're rendering is genuinely slow. Try incrementing the counter and toggling the theme.

Unlike in the previous example, toggling the theme is also slow now! This is because **there is no `useCallback` call in this version,** so `handleSubmit` is always a new function, and the slowed down `ShippingForm` component can't skip re-rendering.

<Sandpack>

```js src/App.js
import { useState } from 'react'
import ProductPage from './ProductPage.js'

export default function App() {
  const [isDark, setIsDark] = useState(false)
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={isDark}
          onChange={(e) => setIsDark(e.target.checked)}
        />
        Dark mode
      </label>
      <hr />
      <ProductPage
        referrerId="wizard_of_oz"
        productId={123}
        theme={isDark ? 'dark' : 'light'}
      />
    </>
  )
}
```

```js src/ProductPage.js active
import ShippingForm from './ShippingForm.js'

export default function ProductPage({ productId, referrer, theme }) {
  function handleSubmit(orderDetails) {
    post('/product/' + productId + '/buy', {
      referrer,
      orderDetails,
    })
  }

  return (
    <div className={theme}>
      <ShippingForm onSubmit={handleSubmit} />
    </div>
  )
}

function post(url, data) {
  // Imagine this sends a request...
  console.log('POST /' + url)
  console.log(data)
}
```

```js {expectedErrors: {'react-compiler': [7, 8]}} src/ShippingForm.js
import { memo, useState } from 'react'

const ShippingForm = memo(function ShippingForm({ onSubmit }) {
  const [count, setCount] = useState(1)

  console.log('[ARTIFICIALLY SLOW] Rendering <ShippingForm />')
  let startTime = performance.now()
  while (performance.now() - startTime < 500) {
    // Do nothing for 500 ms to emulate extremely slow code
  }

  function handleSubmit(e) {
    e.preventDefault()
    const formData = new FormData(e.target)
    const orderDetails = {
      ...Object.fromEntries(formData),
      count,
    }
    onSubmit(orderDetails)
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>
        <b>
          Note: <code>ShippingForm</code> is artificially slowed down!
        </b>
      </p>
      <label>
        Number of items:
        <button type="button" onClick={() => setCount(count - 1)}>
          –
        </button>
        {count}
        <button type="button" onClick={() => setCount(count + 1)}>
          +
        </button>
      </label>
      <label>
        Street:
        <input name="street" />
      </label>
      <label>
        City:
        <input name="city" />
      </label>
      <label>
        Postal code:
        <input name="zipCode" />
      </label>
      <button type="submit">Submit</button>
    </form>
  )
})

export default ShippingForm
```

```css
label {
  display: block;
  margin-top: 10px;
}

input {
  margin-left: 5px;
}

button[type='button'] {
  margin: 5px;
}

.dark {
  background-color: black;
  color: white;
}

.light {
  background-color: white;
  color: black;
}
```

</Sandpack>

However, here is the same code **with the artificial slowdown removed.** Does the lack of `useCallback` feel noticeable or not?

<Sandpack>

```js src/App.js
import { useState } from 'react'
import ProductPage from './ProductPage.js'

export default function App() {
  const [isDark, setIsDark] = useState(false)
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={isDark}
          onChange={(e) => setIsDark(e.target.checked)}
        />
        Dark mode
      </label>
      <hr />
      <ProductPage
        referrerId="wizard_of_oz"
        productId={123}
        theme={isDark ? 'dark' : 'light'}
      />
    </>
  )
}
```

```js src/ProductPage.js active
import ShippingForm from './ShippingForm.js'

export default function ProductPage({ productId, referrer, theme }) {
  function handleSubmit(orderDetails) {
    post('/product/' + productId + '/buy', {
      referrer,
      orderDetails,
    })
  }

  return (
    <div className={theme}>
      <ShippingForm onSubmit={handleSubmit} />
    </div>
  )
}

function post(url, data) {
  // Imagine this sends a request...
  console.log('POST /' + url)
  console.log(data)
}
```

```js src/ShippingForm.js
import { memo, useState } from 'react'

const ShippingForm = memo(function ShippingForm({ onSubmit }) {
  const [count, setCount] = useState(1)

  console.log('Rendering <ShippingForm />')

  function handleSubmit(e) {
    e.preventDefault()
    const formData = new FormData(e.target)
    const orderDetails = {
      ...Object.fromEntries(formData),
      count,
    }
    onSubmit(orderDetails)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Number of items:
        <button type="button" onClick={() => setCount(count - 1)}>
          –
        </button>
        {count}
        <button type="button" onClick={() => setCount(count + 1)}>
          +
        </button>
      </label>
      <label>
        Street:
        <input name="street" />
      </label>
      <label>
        City:
        <input name="city" />
      </label>
      <label>
        Postal code:
        <input name="zipCode" />
      </label>
      <button type="submit">Submit</button>
    </form>
  )
})

export default ShippingForm
```

```css
label {
  display: block;
  margin-top: 10px;
}

input {
  margin-left: 5px;
}

button[type='button'] {
  margin: 5px;
}

.dark {
  background-color: black;
  color: white;
}

.light {
  background-color: white;
  color: black;
}
```

</Sandpack>

Quite often, code without memoization works fine. If your interactions are fast enough, you don't need memoization.

Keep in mind that you need to run React in production mode, disable [React Developer Tools](/learn/react-developer-tools), and use devices similar to the ones your app's users have in order to get a realistic sense of what's actually slowing down your app.

<Solution />

</Recipes>

---

### Updating state from a memoized callback {/_updating-state-from-a-memoized-callback_/}

Sometimes, you might need to update state based on previous state from a memoized callback.

This `handleAddTodo` function specifies `todos` as a dependency because it computes the next todos from it:

```js {6,7}
function TodoList() {
  const [todos, setTodos] = useState([]);

  const handleAddTodo = useCallback((text) => {
    const newTodo = { id: nextId++, text };
    setTodos([...todos, newTodo]);
  }, [todos]);
  // ...
```

You'll usually want memoized functions to have as few dependencies as possible. When you read some state only to calculate the next state, you can remove that dependency by passing an [updater function](/reference/react/useState#updating-state-based-on-the-previous-state) instead:

```js {6,7}
function TodoList() {
  const [todos, setTodos] = useState([]);

  const handleAddTodo = useCallback((text) => {
    const newTodo = { id: nextId++, text };
    setTodos(todos => [...todos, newTodo]);
  }, []); // ✅ No need for the todos dependency
  // ...
```

Here, instead of making `todos` a dependency and reading it inside, you pass an instruction about _how_ to update the state (`todos => [...todos, newTodo]`) to React. [Read more about updater functions.](/reference/react/useState#updating-state-based-on-the-previous-state)

---

### Preventing an Effect from firing too often {/_preventing-an-effect-from-firing-too-often_/}

Sometimes, you might want to call a function from inside an [Effect:](/learn/synchronizing-with-effects)

```js {4-9,12}
function ChatRoom({ roomId }) {
  const [message, setMessage] = useState('');

  function createOptions() {
    return {
      serverUrl: 'https://localhost:1234',
      roomId: roomId
    };
  }

  useEffect(() => {
    const options = createOptions();
    const connection = createConnection(options);
    connection.connect();
    // ...
```

This creates a problem. [Every reactive value must be declared as a dependency of your Effect.](/learn/lifecycle-of-reactive-effects#react-verifies-that-you-specified-every-reactive-value-as-a-dependency) However, if you declare `createOptions` as a dependency, it will cause your Effect to constantly reconnect to the chat room:

```js {6}
useEffect(() => {
  const options = createOptions()
  const connection = createConnection(options)
  connection.connect()
  return () => connection.disconnect()
}, [createOptions]) // 🔴 Problem: This dependency changes on every render
// ...
```

To solve this, you can wrap the function you need to call from an Effect into `useCallback`:

```js {4-9,16}
function ChatRoom({ roomId }) {
  const [message, setMessage] = useState('');

  const createOptions = useCallback(() => {
    return {
      serverUrl: 'https://localhost:1234',
      roomId: roomId
    };
  }, [roomId]); // ✅ Only changes when roomId changes

  useEffect(() => {
    const options = createOptions();
    const connection = createConnection(options);
    connection.connect();
    return () => connection.disconnect();
  }, [createOptions]); // ✅ Only changes when createOptions changes
  // ...
```

This ensures that the `createOptions` function is the same between re-renders if the `roomId` is the same. **However, it's even better to remove the need for a function dependency.** Move your function _inside_ the Effect:

```js {5-10,16}
function ChatRoom({ roomId }) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    function createOptions() { // ✅ No need for useCallback or function dependencies!
      return {
        serverUrl: 'https://localhost:1234',
        roomId: roomId
      };
    }

    const options = createOptions();
    const connection = createConnection(options);
    connection.connect();
    return () => connection.disconnect();
  }, [roomId]); // ✅ Only changes when roomId changes
  // ...
```

Now your code is simpler and doesn't need `useCallback`. [Learn more about removing Effect dependencies.](/learn/removing-effect-dependencies#move-dynamic-objects-and-functions-inside-your-effect)

---

### Optimizing a custom Hook {/_optimizing-a-custom-hook_/}

If you're writing a [custom Hook,](/learn/reusing-logic-with-custom-hooks) it's recommended to wrap any functions that it returns into `useCallback`:

```js {4-6,8-10}
function useRouter() {
  const { dispatch } = useContext(RouterStateContext)

  const navigate = useCallback(
    (url) => {
      dispatch({ type: 'navigate', url })
    },
    [dispatch]
  )

  const goBack = useCallback(() => {
    dispatch({ type: 'back' })
  }, [dispatch])

  return {
    navigate,
    goBack,
  }
}
```

This ensures that the consumers of your Hook can optimize their own code when needed.

---

## Troubleshooting {/_troubleshooting_/}

### Every time my component renders, `useCallback` returns a different function {/_every-time-my-component-renders-usecallback-returns-a-different-function_/}

Make sure you've specified the dependency array as a second argument!

If you forget the dependency array, `useCallback` will return a new function every time:

```js {7}
function ProductPage({ productId, referrer }) {
  const handleSubmit = useCallback((orderDetails) => {
    post('/product/' + productId + '/buy', {
      referrer,
      orderDetails,
    });
  }); // 🔴 Returns a new function every time: no dependency array
  // ...
```

This is the corrected version passing the dependency array as a second argument:

```js {7}
function ProductPage({ productId, referrer }) {
  const handleSubmit = useCallback((orderDetails) => {
    post('/product/' + productId + '/buy', {
      referrer,
      orderDetails,
    });
  }, [productId, referrer]); // ✅ Does not return a new function unnecessarily
  // ...
```

If this doesn't help, then the problem is that at least one of your dependencies is different from the previous render. You can debug this problem by manually logging your dependencies to the console:

```js {5}
const handleSubmit = useCallback(
  (orderDetails) => {
    // ..
  },
  [productId, referrer]
)

console.log([productId, referrer])
```

You can then right-click on the arrays from different re-renders in the console and select "Store as a global variable" for both of them. Assuming the first one got saved as `temp1` and the second one got saved as `temp2`, you can then use the browser console to check whether each dependency in both arrays is the same:

```js
Object.is(temp1[0], temp2[0]) // Is the first dependency the same between the arrays?
Object.is(temp1[1], temp2[1]) // Is the second dependency the same between the arrays?
Object.is(temp1[2], temp2[2]) // ... and so on for every dependency ...
```

When you find which dependency is breaking memoization, either find a way to remove it, or [memoize it as well.](/reference/react/useMemo#memoizing-a-dependency-of-another-hook)

---

### I need to call `useCallback` for each list item in a loop, but it's not allowed {/_i-need-to-call-usememo-for-each-list-item-in-a-loop-but-its-not-allowed_/}

Suppose the `Chart` component is wrapped in [`memo`](/reference/react/memo). You want to skip re-rendering every `Chart` in the list when the `ReportList` component re-renders. However, you can't call `useCallback` in a loop:

```js {expectedErrors: {'react-compiler': [6]}} {5-14}
function ReportList({ items }) {
  return (
    <article>
      {items.map((item) => {
        // 🔴 You can't call useCallback in a loop like this:
        const handleClick = useCallback(() => {
          sendReport(item)
        }, [item])

        return (
          <figure key={item.id}>
            <Chart onClick={handleClick} />
          </figure>
        )
      })}
    </article>
  )
}
```

Instead, extract a component for an individual item, and put `useCallback` there:

```js {5,12-21}
function ReportList({ items }) {
  return (
    <article>
      {items.map((item) => (
        <Report key={item.id} item={item} />
      ))}
    </article>
  )
}

function Report({ item }) {
  // ✅ Call useCallback at the top level:
  const handleClick = useCallback(() => {
    sendReport(item)
  }, [item])

  return (
    <figure>
      <Chart onClick={handleClick} />
    </figure>
  )
}
```

Alternatively, you could remove `useCallback` in the last snippet and instead wrap `Report` itself in [`memo`.](/reference/react/memo) If the `item` prop does not change, `Report` will skip re-rendering, so `Chart` will skip re-rendering too:

```js {5,6-8,15}
function ReportList({ items }) {
  // ...
}

const Report = memo(function Report({ item }) {
  function handleClick() {
    sendReport(item)
  }

  return (
    <figure>
      <Chart onClick={handleClick} />
    </figure>
  )
})
```
