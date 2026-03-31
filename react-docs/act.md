---
title: act
---

<Intro>

`act` is a test helper to apply pending React updates before making assertions.

```js
await act(async actFn)
```

</Intro>

To prepare a component for assertions, wrap the code rendering it and performing updates inside an `await act()` call. This makes your test run closer to how React works in the browser.

<Note>
You might find using `act()` directly a bit too verbose. To avoid some of the boilerplate, you could use a library like [React Testing Library](https://testing-library.com/docs/react-testing-library/intro), whose helpers are wrapped with `act()`.
</Note>

<InlineToc />

---

## Reference {/_reference_/}

### `await act(async actFn)` {/_await-act-async-actfn_/}

When writing UI tests, tasks like rendering, user events, or data fetching can be considered as “units” of interaction with a user interface. React provides a helper called `act()` that makes sure all updates related to these “units” have been processed and applied to the DOM before you make any assertions.

The name `act` comes from the [Arrange-Act-Assert](https://wiki.c2.com/?ArrangeActAssert) pattern.

```js {2,4}
it('renders with button disabled', async () => {
  await act(async () => {
    root.render(<TestComponent />)
  })
  expect(container.querySelector('button')).toBeDisabled()
})
```

<Note>

We recommend using `act` with `await` and an `async` function. Although the sync version works in many cases, it doesn't work in all cases and due to the way React schedules updates internally, it's difficult to predict when you can use the sync version.

We will deprecate and remove the sync version in the future.

</Note>

#### Parameters {/_parameters_/}

- `async actFn`: An async function wrapping renders or interactions for components being tested. Any updates triggered within the `actFn`, are added to an internal act queue, which are then flushed together to process and apply any changes to the DOM. Since it is async, React will also run any code that crosses an async boundary, and flush any updates scheduled.

#### Returns {/_returns_/}

`act` does not return anything.

## Usage {/_usage_/}

When testing a component, you can use `act` to make assertions about its output.

For example, let’s say we have this `Counter` component, the usage examples below show how to test it:

```js
function Counter() {
  const [count, setCount] = useState(0)
  const handleClick = () => {
    setCount((prev) => prev + 1)
  }

  useEffect(() => {
    document.title = `You clicked ${count} times`
  }, [count])

  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={handleClick}>Click me</button>
    </div>
  )
}
```

### Rendering components in tests {/_rendering-components-in-tests_/}

To test the render output of a component, wrap the render inside `act()`:

```js {10,12}
import { act } from 'react'
import ReactDOMClient from 'react-dom/client'
import Counter from './Counter'

it('can render and update a counter', async () => {
  container = document.createElement('div')
  document.body.appendChild(container)

  // ✅ Render the component inside act().
  await act(() => {
    ReactDOMClient.createRoot(container).render(<Counter />)
  })

  const button = container.querySelector('button')
  const label = container.querySelector('p')
  expect(label.textContent).toBe('You clicked 0 times')
  expect(document.title).toBe('You clicked 0 times')
})
```

Here, we create a container, append it to the document, and render the `Counter` component inside `act()`. This ensures that the component is rendered and its effects are applied before making assertions.

Using `act` ensures that all updates have been applied before we make assertions.

### Dispatching events in tests {/_dispatching-events-in-tests_/}

To test events, wrap the event dispatch inside `act()`:

```js {14,16}
import { act } from 'react'
import ReactDOMClient from 'react-dom/client'
import Counter from './Counter'

it.only('can render and update a counter', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)

  await act(async () => {
    ReactDOMClient.createRoot(container).render(<Counter />)
  })

  // ✅ Dispatch the event inside act().
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

  const button = container.querySelector('button')
  const label = container.querySelector('p')
  expect(label.textContent).toBe('You clicked 1 times')
  expect(document.title).toBe('You clicked 1 times')
})
```

Here, we render the component with `act`, and then dispatch the event inside another `act()`. This ensures that all updates from the event are applied before making assertions.

<Pitfall>

Don’t forget that dispatching DOM events only works when the DOM container is added to the document. You can use a library like [React Testing Library](https://testing-library.com/docs/react-testing-library/intro) to reduce the boilerplate code.

</Pitfall>

## Troubleshooting {/_troubleshooting_/}

### I'm getting an error: "The current testing environment is not configured to support act(...)" {/_error-the-current-testing-environment-is-not-configured-to-support-act_/}

Using `act` requires setting `global.IS_REACT_ACT_ENVIRONMENT=true` in your test environment. This is to ensure that `act` is only used in the correct environment.

If you don't set the global, you will see an error like this:

<ConsoleBlock level="error">

Warning: The current testing environment is not configured to support act(...)

</ConsoleBlock>

To fix, add this to your global setup file for React tests:

```js
global.IS_REACT_ACT_ENVIRONMENT = true
```

<Note>

In testing frameworks like [React Testing Library](https://testing-library.com/docs/react-testing-library/intro), `IS_REACT_ACT_ENVIRONMENT` is already set for you.

</Note>
