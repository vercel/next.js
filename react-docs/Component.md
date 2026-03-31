---
title: Component
---

<Pitfall>

We recommend defining components as functions instead of classes. [See how to migrate.](#alternatives)

</Pitfall>

<Intro>

`Component` is the base class for the React components defined as [JavaScript classes.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes) Class components are still supported by React, but we don't recommend using them in new code.

```js
class Greeting extends Component {
  render() {
    return <h1>Hello, {this.props.name}!</h1>
  }
}
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `Component` {/_component_/}

To define a React component as a class, extend the built-in `Component` class and define a [`render` method:](#render)

```js
import { Component } from 'react'

class Greeting extends Component {
  render() {
    return <h1>Hello, {this.props.name}!</h1>
  }
}
```

Only the `render` method is required, other methods are optional.

[See more examples below.](#usage)

---

### `context` {/_context_/}

The [context](/learn/passing-data-deeply-with-context) of a class component is available as `this.context`. It is only available if you specify _which_ context you want to receive using [`static contextType`](#static-contexttype).

A class component can only read one context at a time.

```js {2,5}
class Button extends Component {
  static contextType = ThemeContext

  render() {
    const theme = this.context
    const className = 'button-' + theme
    return <button className={className}>{this.props.children}</button>
  }
}
```

<Note>

Reading `this.context` in class components is equivalent to [`useContext`](/reference/react/useContext) in function components.

[See how to migrate.](#migrating-a-component-with-context-from-a-class-to-a-function)

</Note>

---

### `props` {/_props_/}

The props passed to a class component are available as `this.props`.

```js {3}
class Greeting extends Component {
  render() {
    return <h1>Hello, {this.props.name}!</h1>
  }
}

;<Greeting name="Taylor" />
```

<Note>

Reading `this.props` in class components is equivalent to [declaring props](/learn/passing-props-to-a-component#step-2-read-props-inside-the-child-component) in function components.

[See how to migrate.](#migrating-a-simple-component-from-a-class-to-a-function)

</Note>

---

### `state` {/_state_/}

The state of a class component is available as `this.state`. The `state` field must be an object. Do not mutate the state directly. If you wish to change the state, call `setState` with the new state.

```js {2-4,7-9,18}
class Counter extends Component {
  state = {
    age: 42,
  }

  handleAgeChange = () => {
    this.setState({
      age: this.state.age + 1,
    })
  }

  render() {
    return (
      <>
        <button onClick={this.handleAgeChange}>Increment age</button>
        <p>You are {this.state.age}.</p>
      </>
    )
  }
}
```

<Note>

Defining `state` in class components is equivalent to calling [`useState`](/reference/react/useState) in function components.

[See how to migrate.](#migrating-a-component-with-state-from-a-class-to-a-function)

</Note>

---

### `constructor(props)` {/_constructor_/}

The [constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/constructor) runs before your class component _mounts_ (gets added to the screen). Typically, a constructor is only used for two purposes in React. It lets you declare state and [bind](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_objects/Function/bind) your class methods to the class instance:

```js {2-6}
class Counter extends Component {
  constructor(props) {
    super(props);
    this.state = { counter: 0 };
    this.handleClick = this.handleClick.bind(this);
  }

  handleClick() {
    // ...
  }
```

If you use modern JavaScript syntax, constructors are rarely needed. Instead, you can rewrite this code above using the [public class field syntax](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Public_class_fields) which is supported both by modern browsers and tools like [Babel:](https://babeljs.io/)

```js {2,4}
class Counter extends Component {
  state = { counter: 0 };

  handleClick = () => {
    // ...
  }
```

A constructor should not contain any side effects or subscriptions.

#### Parameters {/_constructor-parameters_/}

- `props`: The component's initial props.

#### Returns {/_constructor-returns_/}

`constructor` should not return anything.

#### Caveats {/_constructor-caveats_/}

- Do not run any side effects or subscriptions in the constructor. Instead, use [`componentDidMount`](#componentdidmount) for that.

- Inside a constructor, you need to call `super(props)` before any other statement. If you don't do that, `this.props` will be `undefined` while the constructor runs, which can be confusing and cause bugs.

- Constructor is the only place where you can assign [`this.state`](#state) directly. In all other methods, you need to use [`this.setState()`](#setstate) instead. Do not call `setState` in the constructor.

- When you use [server rendering,](/reference/react-dom/server) the constructor will run on the server too, followed by the [`render`](#render) method. However, lifecycle methods like `componentDidMount` or `componentWillUnmount` will not run on the server.

- When [Strict Mode](/reference/react/StrictMode) is on, React will call `constructor` twice in development and then throw away one of the instances. This helps you notice the accidental side effects that need to be moved out of the `constructor`.

<Note>

There is no exact equivalent for `constructor` in function components. To declare state in a function component, call [`useState`.](/reference/react/useState) To avoid recalculating the initial state, [pass a function to `useState`.](/reference/react/useState#avoiding-recreating-the-initial-state)

</Note>

---

### `componentDidCatch(error, info)` {/_componentdidcatch_/}

If you define `componentDidCatch`, React will call it when some child component (including distant children) throws an error during rendering. This lets you log that error to an error reporting service in production.

Typically, it is used together with [`static getDerivedStateFromError`](#static-getderivedstatefromerror) which lets you update state in response to an error and display an error message to the user. A component with these methods is called an _Error Boundary_.

[See an example.](#catching-rendering-errors-with-an-error-boundary)

#### Parameters {/_componentdidcatch-parameters_/}

- `error`: The error that was thrown. In practice, it will usually be an instance of [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) but this is not guaranteed because JavaScript allows to [`throw`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/throw) any value, including strings or even `null`.

- `info`: An object containing additional information about the error. Its `componentStack` field contains a stack trace with the component that threw, as well as the names and source locations of all its parent components. In production, the component names will be minified. If you set up production error reporting, you can decode the component stack using sourcemaps the same way as you would do for regular JavaScript error stacks.

#### Returns {/_componentdidcatch-returns_/}

`componentDidCatch` should not return anything.

#### Caveats {/_componentdidcatch-caveats_/}

- In the past, it was common to call `setState` inside `componentDidCatch` in order to update the UI and display the fallback error message. This is deprecated in favor of defining [`static getDerivedStateFromError`.](#static-getderivedstatefromerror)

- Production and development builds of React slightly differ in the way `componentDidCatch` handles errors. In development, the errors will bubble up to `window`, which means that any `window.onerror` or `window.addEventListener('error', callback)` will intercept the errors that have been caught by `componentDidCatch`. In production, instead, the errors will not bubble up, which means any ancestor error handler will only receive errors not explicitly caught by `componentDidCatch`.

<Note>

There is no direct equivalent for `componentDidCatch` in function components yet. If you'd like to avoid creating class components, write a single `ErrorBoundary` component like above and use it throughout your app. Alternatively, you can use the [`react-error-boundary`](https://github.com/bvaughn/react-error-boundary) package which does that for you.

</Note>

---

### `componentDidMount()` {/_componentdidmount_/}

If you define the `componentDidMount` method, React will call it when your component is added _(mounted)_ to the screen. This is a common place to start data fetching, set up subscriptions, or manipulate the DOM nodes.

If you implement `componentDidMount`, you usually need to implement other lifecycle methods to avoid bugs. For example, if `componentDidMount` reads some state or props, you also have to implement [`componentDidUpdate`](#componentdidupdate) to handle their changes, and [`componentWillUnmount`](#componentwillunmount) to clean up whatever `componentDidMount` was doing.

```js {6-8}
class ChatRoom extends Component {
  state = {
    serverUrl: 'https://localhost:1234',
  }

  componentDidMount() {
    this.setupConnection()
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      this.props.roomId !== prevProps.roomId ||
      this.state.serverUrl !== prevState.serverUrl
    ) {
      this.destroyConnection()
      this.setupConnection()
    }
  }

  componentWillUnmount() {
    this.destroyConnection()
  }

  // ...
}
```

[See more examples.](#adding-lifecycle-methods-to-a-class-component)

#### Parameters {/_componentdidmount-parameters_/}

`componentDidMount` does not take any parameters.

#### Returns {/_componentdidmount-returns_/}

`componentDidMount` should not return anything.

#### Caveats {/_componentdidmount-caveats_/}

- When [Strict Mode](/reference/react/StrictMode) is on, in development React will call `componentDidMount`, then immediately call [`componentWillUnmount`,](#componentwillunmount) and then call `componentDidMount` again. This helps you notice if you forgot to implement `componentWillUnmount` or if its logic doesn't fully "mirror" what `componentDidMount` does.

- Although you may call [`setState`](#setstate) immediately in `componentDidMount`, it's best to avoid that when you can. It will trigger an extra rendering, but it will happen before the browser updates the screen. This guarantees that even though the [`render`](#render) will be called twice in this case, the user won't see the intermediate state. Use this pattern with caution because it often causes performance issues. In most cases, you should be able to assign the initial state in the [`constructor`](#constructor) instead. It can, however, be necessary for cases like modals and tooltips when you need to measure a DOM node before rendering something that depends on its size or position.

<Note>

For many use cases, defining `componentDidMount`, `componentDidUpdate`, and `componentWillUnmount` together in class components is equivalent to calling [`useEffect`](/reference/react/useEffect) in function components. In the rare cases where it's important for the code to run before browser paint, [`useLayoutEffect`](/reference/react/useLayoutEffect) is a closer match.

[See how to migrate.](#migrating-a-component-with-lifecycle-methods-from-a-class-to-a-function)

</Note>

---

### `componentDidUpdate(prevProps, prevState, snapshot?)` {/_componentdidupdate_/}

If you define the `componentDidUpdate` method, React will call it immediately after your component has been re-rendered with updated props or state. This method is not called for the initial render.

You can use it to manipulate the DOM after an update. This is also a common place to do network requests as long as you compare the current props to previous props (e.g. a network request may not be necessary if the props have not changed). Typically, you'd use it together with [`componentDidMount`](#componentdidmount) and [`componentWillUnmount`:](#componentwillunmount)

```js {10-18}
class ChatRoom extends Component {
  state = {
    serverUrl: 'https://localhost:1234',
  }

  componentDidMount() {
    this.setupConnection()
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      this.props.roomId !== prevProps.roomId ||
      this.state.serverUrl !== prevState.serverUrl
    ) {
      this.destroyConnection()
      this.setupConnection()
    }
  }

  componentWillUnmount() {
    this.destroyConnection()
  }

  // ...
}
```

[See more examples.](#adding-lifecycle-methods-to-a-class-component)

#### Parameters {/_componentdidupdate-parameters_/}

- `prevProps`: Props before the update. Compare `prevProps` to [`this.props`](#props) to determine what changed.

- `prevState`: State before the update. Compare `prevState` to [`this.state`](#state) to determine what changed.

- `snapshot`: If you implemented [`getSnapshotBeforeUpdate`](#getsnapshotbeforeupdate), `snapshot` will contain the value you returned from that method. Otherwise, it will be `undefined`.

#### Returns {/_componentdidupdate-returns_/}

`componentDidUpdate` should not return anything.

#### Caveats {/_componentdidupdate-caveats_/}

- `componentDidUpdate` will not get called if [`shouldComponentUpdate`](#shouldcomponentupdate) is defined and returns `false`.

- The logic inside `componentDidUpdate` should usually be wrapped in conditions comparing `this.props` with `prevProps`, and `this.state` with `prevState`. Otherwise, there's a risk of creating infinite loops.

- Although you may call [`setState`](#setstate) immediately in `componentDidUpdate`, it's best to avoid that when you can. It will trigger an extra rendering, but it will happen before the browser updates the screen. This guarantees that even though the [`render`](#render) will be called twice in this case, the user won't see the intermediate state. This pattern often causes performance issues, but it may be necessary for rare cases like modals and tooltips when you need to measure a DOM node before rendering something that depends on its size or position.

<Note>

For many use cases, defining `componentDidMount`, `componentDidUpdate`, and `componentWillUnmount` together in class components is equivalent to calling [`useEffect`](/reference/react/useEffect) in function components. In the rare cases where it's important for the code to run before browser paint, [`useLayoutEffect`](/reference/react/useLayoutEffect) is a closer match.

[See how to migrate.](#migrating-a-component-with-lifecycle-methods-from-a-class-to-a-function)

## </Note>

### `componentWillMount()` {/_componentwillmount_/}

<Deprecated>

This API has been renamed from `componentWillMount` to [`UNSAFE_componentWillMount`.](#unsafe_componentwillmount) The old name has been deprecated. In a future major version of React, only the new name will work.

Run the [`rename-unsafe-lifecycles` codemod](https://github.com/reactjs/react-codemod#rename-unsafe-lifecycles) to automatically update your components.

</Deprecated>

---

### `componentWillReceiveProps(nextProps)` {/_componentwillreceiveprops_/}

<Deprecated>

This API has been renamed from `componentWillReceiveProps` to [`UNSAFE_componentWillReceiveProps`.](#unsafe_componentwillreceiveprops) The old name has been deprecated. In a future major version of React, only the new name will work.

Run the [`rename-unsafe-lifecycles` codemod](https://github.com/reactjs/react-codemod#rename-unsafe-lifecycles) to automatically update your components.

</Deprecated>

---

### `componentWillUpdate(nextProps, nextState)` {/_componentwillupdate_/}

<Deprecated>

This API has been renamed from `componentWillUpdate` to [`UNSAFE_componentWillUpdate`.](#unsafe_componentwillupdate) The old name has been deprecated. In a future major version of React, only the new name will work.

Run the [`rename-unsafe-lifecycles` codemod](https://github.com/reactjs/react-codemod#rename-unsafe-lifecycles) to automatically update your components.

</Deprecated>

---

### `componentWillUnmount()` {/_componentwillunmount_/}

If you define the `componentWillUnmount` method, React will call it before your component is removed _(unmounted)_ from the screen. This is a common place to cancel data fetching or remove subscriptions.

The logic inside `componentWillUnmount` should "mirror" the logic inside [`componentDidMount`.](#componentdidmount) For example, if `componentDidMount` sets up a subscription, `componentWillUnmount` should clean up that subscription. If the cleanup logic in your `componentWillUnmount` reads some props or state, you will usually also need to implement [`componentDidUpdate`](#componentdidupdate) to clean up resources (such as subscriptions) corresponding to the old props and state.

```js {20-22}
class ChatRoom extends Component {
  state = {
    serverUrl: 'https://localhost:1234',
  }

  componentDidMount() {
    this.setupConnection()
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      this.props.roomId !== prevProps.roomId ||
      this.state.serverUrl !== prevState.serverUrl
    ) {
      this.destroyConnection()
      this.setupConnection()
    }
  }

  componentWillUnmount() {
    this.destroyConnection()
  }

  // ...
}
```

[See more examples.](#adding-lifecycle-methods-to-a-class-component)

#### Parameters {/_componentwillunmount-parameters_/}

`componentWillUnmount` does not take any parameters.

#### Returns {/_componentwillunmount-returns_/}

`componentWillUnmount` should not return anything.

#### Caveats {/_componentwillunmount-caveats_/}

- When [Strict Mode](/reference/react/StrictMode) is on, in development React will call [`componentDidMount`,](#componentdidmount) then immediately call `componentWillUnmount`, and then call `componentDidMount` again. This helps you notice if you forgot to implement `componentWillUnmount` or if its logic doesn't fully "mirror" what `componentDidMount` does.

<Note>

For many use cases, defining `componentDidMount`, `componentDidUpdate`, and `componentWillUnmount` together in class components is equivalent to calling [`useEffect`](/reference/react/useEffect) in function components. In the rare cases where it's important for the code to run before browser paint, [`useLayoutEffect`](/reference/react/useLayoutEffect) is a closer match.

[See how to migrate.](#migrating-a-component-with-lifecycle-methods-from-a-class-to-a-function)

</Note>

---

### `forceUpdate(callback?)` {/_forceupdate_/}

Forces a component to re-render.

Usually, this is not necessary. If your component's [`render`](#render) method only reads from [`this.props`](#props), [`this.state`](#state), or [`this.context`,](#context) it will re-render automatically when you call [`setState`](#setstate) inside your component or one of its parents. However, if your component's `render` method reads directly from an external data source, you have to tell React to update the user interface when that data source changes. That's what `forceUpdate` lets you do.

Try to avoid all uses of `forceUpdate` and only read from `this.props` and `this.state` in `render`.

#### Parameters {/_forceupdate-parameters_/}

- **optional** `callback` If specified, React will call the `callback` you've provided after the update is committed.

#### Returns {/_forceupdate-returns_/}

`forceUpdate` does not return anything.

#### Caveats {/_forceupdate-caveats_/}

- If you call `forceUpdate`, React will re-render without calling [`shouldComponentUpdate`.](#shouldcomponentupdate)

<Note>

Reading an external data source and forcing class components to re-render in response to its changes with `forceUpdate` has been superseded by [`useSyncExternalStore`](/reference/react/useSyncExternalStore) in function components.

</Note>

---

### `getSnapshotBeforeUpdate(prevProps, prevState)` {/_getsnapshotbeforeupdate_/}

If you implement `getSnapshotBeforeUpdate`, React will call it immediately before React updates the DOM. It enables your component to capture some information from the DOM (e.g. scroll position) before it is potentially changed. Any value returned by this lifecycle method will be passed as a parameter to [`componentDidUpdate`.](#componentdidupdate)

For example, you can use it in a UI like a chat thread that needs to preserve its scroll position during updates:

```js {7-15,17}
class ScrollingList extends React.Component {
  constructor(props) {
    super(props)
    this.listRef = React.createRef()
  }

  getSnapshotBeforeUpdate(prevProps, prevState) {
    // Are we adding new items to the list?
    // Capture the scroll position so we can adjust scroll later.
    if (prevProps.list.length < this.props.list.length) {
      const list = this.listRef.current
      return list.scrollHeight - list.scrollTop
    }
    return null
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
    // If we have a snapshot value, we've just added new items.
    // Adjust scroll so these new items don't push the old ones out of view.
    // (snapshot here is the value returned from getSnapshotBeforeUpdate)
    if (snapshot !== null) {
      const list = this.listRef.current
      list.scrollTop = list.scrollHeight - snapshot
    }
  }

  render() {
    return <div ref={this.listRef}>{/* ...contents... */}</div>
  }
}
```

In the above example, it is important to read the `scrollHeight` property directly in `getSnapshotBeforeUpdate`. It is not safe to read it in [`render`](#render), [`UNSAFE_componentWillReceiveProps`](#unsafe_componentwillreceiveprops), or [`UNSAFE_componentWillUpdate`](#unsafe_componentwillupdate) because there is a potential time gap between these methods getting called and React updating the DOM.

#### Parameters {/_getsnapshotbeforeupdate-parameters_/}

- `prevProps`: Props before the update. Compare `prevProps` to [`this.props`](#props) to determine what changed.

- `prevState`: State before the update. Compare `prevState` to [`this.state`](#state) to determine what changed.

#### Returns {/_getsnapshotbeforeupdate-returns_/}

You should return a snapshot value of any type that you'd like, or `null`. The value you returned will be passed as the third argument to [`componentDidUpdate`.](#componentdidupdate)

#### Caveats {/_getsnapshotbeforeupdate-caveats_/}

- `getSnapshotBeforeUpdate` will not get called if [`shouldComponentUpdate`](#shouldcomponentupdate) is defined and returns `false`.

<Note>

At the moment, there is no equivalent to `getSnapshotBeforeUpdate` for function components. This use case is very uncommon, but if you have the need for it, for now you'll have to write a class component.

</Note>

---

### `render()` {/_render_/}

The `render` method is the only required method in a class component.

The `render` method should specify what you want to appear on the screen, for example:

```js {4-6}
import { Component } from 'react'

class Greeting extends Component {
  render() {
    return <h1>Hello, {this.props.name}!</h1>
  }
}
```

React may call `render` at any moment, so you shouldn't assume that it runs at a particular time. Usually, the `render` method should return a piece of [JSX](/learn/writing-markup-with-jsx), but a few [other return types](#render-returns) (like strings) are supported. To calculate the returned JSX, the `render` method can read [`this.props`](#props), [`this.state`](#state), and [`this.context`](#context).

You should write the `render` method as a pure function, meaning that it should return the same result if props, state, and context are the same. It also shouldn't contain side effects (like setting up subscriptions) or interact with the browser APIs. Side effects should happen either in event handlers or methods like [`componentDidMount`.](#componentdidmount)

#### Parameters {/_render-parameters_/}

`render` does not take any parameters.

#### Returns {/_render-returns_/}

`render` can return any valid React node. This includes React elements such as `<div />`, strings, numbers, [portals](/reference/react-dom/createPortal), empty nodes (`null`, `undefined`, `true`, and `false`), and arrays of React nodes.

#### Caveats {/_render-caveats_/}

- `render` should be written as a pure function of props, state, and context. It should not have side effects.

- `render` will not get called if [`shouldComponentUpdate`](#shouldcomponentupdate) is defined and returns `false`.

- When [Strict Mode](/reference/react/StrictMode) is on, React will call `render` twice in development and then throw away one of the results. This helps you notice the accidental side effects that need to be moved out of the `render` method.

- There is no one-to-one correspondence between the `render` call and the subsequent `componentDidMount` or `componentDidUpdate` call. Some of the `render` call results may be discarded by React when it's beneficial.

---

### `setState(nextState, callback?)` {/_setstate_/}

Call `setState` to update the state of your React component.

```js {8-10}
class Form extends Component {
  state = {
    name: 'Taylor',
  }

  handleNameChange = (e) => {
    const newName = e.target.value
    this.setState({
      name: newName,
    })
  }

  render() {
    return (
      <>
        <input value={this.state.name} onChange={this.handleNameChange} />
        <p>Hello, {this.state.name}.</p>
      </>
    )
  }
}
```

`setState` enqueues changes to the component state. It tells React that this component and its children need to re-render with the new state. This is the main way you'll update the user interface in response to interactions.

<Pitfall>

Calling `setState` **does not** change the current state in the already executing code:

```js {6}
function handleClick() {
  console.log(this.state.name) // "Taylor"
  this.setState({
    name: 'Robin',
  })
  console.log(this.state.name) // Still "Taylor"!
}
```

It only affects what `this.state` will return starting from the _next_ render.

</Pitfall>

You can also pass a function to `setState`. It lets you update state based on the previous state:

```js {2-6}
handleIncreaseAge = () => {
  this.setState((prevState) => {
    return {
      age: prevState.age + 1,
    }
  })
}
```

You don't have to do this, but it's handy if you want to update state multiple times during the same event.

#### Parameters {/_setstate-parameters_/}

- `nextState`: Either an object or a function.
  - If you pass an object as `nextState`, it will be shallowly merged into `this.state`.
  - If you pass a function as `nextState`, it will be treated as an _updater function_. It must be pure, should take the pending state and props as arguments, and should return the object to be shallowly merged into `this.state`. React will put your updater function in a queue and re-render your component. During the next render, React will calculate the next state by applying all of the queued updaters to the previous state.

- **optional** `callback`: If specified, React will call the `callback` you've provided after the update is committed.

#### Returns {/_setstate-returns_/}

`setState` does not return anything.

#### Caveats {/_setstate-caveats_/}

- Think of `setState` as a _request_ rather than an immediate command to update the component. When multiple components update their state in response to an event, React will batch their updates and re-render them together in a single pass at the end of the event. In the rare case that you need to force a particular state update to be applied synchronously, you may wrap it in [`flushSync`,](/reference/react-dom/flushSync) but this may hurt performance.

- `setState` does not update `this.state` immediately. This makes reading `this.state` right after calling `setState` a potential pitfall. Instead, use [`componentDidUpdate`](#componentdidupdate) or the setState `callback` argument, either of which are guaranteed to fire after the update has been applied. If you need to set the state based on the previous state, you can pass a function to `nextState` as described above.

<Note>

Calling `setState` in class components is similar to calling a [`set` function](/reference/react/useState#setstate) in function components.

[See how to migrate.](#migrating-a-component-with-state-from-a-class-to-a-function)

</Note>

---

### `shouldComponentUpdate(nextProps, nextState, nextContext)` {/_shouldcomponentupdate_/}

If you define `shouldComponentUpdate`, React will call it to determine whether a re-render can be skipped.

If you are confident you want to write it by hand, you may compare `this.props` with `nextProps` and `this.state` with `nextState` and return `false` to tell React the update can be skipped.

```js {6-18}
class Rectangle extends Component {
  state = {
    isHovered: false,
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (
      nextProps.position.x === this.props.position.x &&
      nextProps.position.y === this.props.position.y &&
      nextProps.size.width === this.props.size.width &&
      nextProps.size.height === this.props.size.height &&
      nextState.isHovered === this.state.isHovered
    ) {
      // Nothing has changed, so a re-render is unnecessary
      return false
    }
    return true
  }

  // ...
}
```

React calls `shouldComponentUpdate` before rendering when new props or state are being received. Defaults to `true`. This method is not called for the initial render or when [`forceUpdate`](#forceupdate) is used.

#### Parameters {/_shouldcomponentupdate-parameters_/}

- `nextProps`: The next props that the component is about to render with. Compare `nextProps` to [`this.props`](#props) to determine what changed.
- `nextState`: The next state that the component is about to render with. Compare `nextState` to [`this.state`](#props) to determine what changed.
- `nextContext`: The next context that the component is about to render with. Compare `nextContext` to [`this.context`](#context) to determine what changed. Only available if you specify [`static contextType`](#static-contexttype).

#### Returns {/_shouldcomponentupdate-returns_/}

Return `true` if you want the component to re-render. That's the default behavior.

Return `false` to tell React that re-rendering can be skipped.

#### Caveats {/_shouldcomponentupdate-caveats_/}

- This method _only_ exists as a performance optimization. If your component breaks without it, fix that first.

- Consider using [`PureComponent`](/reference/react/PureComponent) instead of writing `shouldComponentUpdate` by hand. `PureComponent` shallowly compares props and state, and reduces the chance that you'll skip a necessary update.

- We do not recommend doing deep equality checks or using `JSON.stringify` in `shouldComponentUpdate`. It makes performance unpredictable and dependent on the data structure of every prop and state. In the best case, you risk introducing multi-second stalls to your application, and in the worst case you risk crashing it.

- Returning `false` does not prevent child components from re-rendering when _their_ state changes.

- Returning `false` does not _guarantee_ that the component will not re-render. React will use the return value as a hint but it may still choose to re-render your component if it makes sense to do for other reasons.

<Note>

Optimizing class components with `shouldComponentUpdate` is similar to optimizing function components with [`memo`.](/reference/react/memo) Function components also offer more granular optimization with [`useMemo`.](/reference/react/useMemo)

</Note>

---

### `UNSAFE_componentWillMount()` {/_unsafe_componentwillmount_/}

If you define `UNSAFE_componentWillMount`, React will call it immediately after the [`constructor`.](#constructor) It only exists for historical reasons and should not be used in any new code. Instead, use one of the alternatives:

- To initialize state, declare [`state`](#state) as a class field or set `this.state` inside the [`constructor`.](#constructor)
- If you need to run a side effect or set up a subscription, move that logic to [`componentDidMount`](#componentdidmount) instead.

[See examples of migrating away from unsafe lifecycles.](https://legacy.reactjs.org/blog/2018/03/27/update-on-async-rendering.html#examples)

#### Parameters {/_unsafe_componentwillmount-parameters_/}

`UNSAFE_componentWillMount` does not take any parameters.

#### Returns {/_unsafe_componentwillmount-returns_/}

`UNSAFE_componentWillMount` should not return anything.

#### Caveats {/_unsafe_componentwillmount-caveats_/}

- `UNSAFE_componentWillMount` will not get called if the component implements [`static getDerivedStateFromProps`](#static-getderivedstatefromprops) or [`getSnapshotBeforeUpdate`.](#getsnapshotbeforeupdate)

- Despite its naming, `UNSAFE_componentWillMount` does not guarantee that the component _will_ get mounted if your app uses modern React features like [`Suspense`.](/reference/react/Suspense) If a render attempt is suspended (for example, because the code for some child component has not loaded yet), React will throw the in-progress tree away and attempt to construct the component from scratch during the next attempt. This is why this method is "unsafe". Code that relies on mounting (like adding a subscription) should go into [`componentDidMount`.](#componentdidmount)

- `UNSAFE_componentWillMount` is the only lifecycle method that runs during [server rendering.](/reference/react-dom/server) For all practical purposes, it is identical to [`constructor`,](#constructor) so you should use the `constructor` for this type of logic instead.

<Note>

Calling [`setState`](#setstate) inside `UNSAFE_componentWillMount` in a class component to initialize state is equivalent to passing that state as the initial state to [`useState`](/reference/react/useState) in a function component.

</Note>

---

### `UNSAFE_componentWillReceiveProps(nextProps, nextContext)` {/_unsafe_componentwillreceiveprops_/}

If you define `UNSAFE_componentWillReceiveProps`, React will call it when the component receives new props. It only exists for historical reasons and should not be used in any new code. Instead, use one of the alternatives:

- If you need to **run a side effect** (for example, fetch data, run an animation, or reinitialize a subscription) in response to prop changes, move that logic to [`componentDidUpdate`](#componentdidupdate) instead.
- If you need to **avoid re-computing some data only when a prop changes,** use a [memoization helper](https://legacy.reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html#what-about-memoization) instead.
- If you need to **"reset" some state when a prop changes,** consider either making a component [fully controlled](https://legacy.reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html#recommendation-fully-controlled-component) or [fully uncontrolled with a key](https://legacy.reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html#recommendation-fully-uncontrolled-component-with-a-key) instead.
- If you need to **"adjust" some state when a prop changes,** check whether you can compute all the necessary information from props alone during rendering. If you can't, use [`static getDerivedStateFromProps`](/reference/react/Component#static-getderivedstatefromprops) instead.

[See examples of migrating away from unsafe lifecycles.](https://legacy.reactjs.org/blog/2018/03/27/update-on-async-rendering.html#updating-state-based-on-props)

#### Parameters {/_unsafe_componentwillreceiveprops-parameters_/}

- `nextProps`: The next props that the component is about to receive from its parent component. Compare `nextProps` to [`this.props`](#props) to determine what changed.
- `nextContext`: The next context that the component is about to receive from the closest provider. Compare `nextContext` to [`this.context`](#context) to determine what changed. Only available if you specify [`static contextType`](#static-contexttype).

#### Returns {/_unsafe_componentwillreceiveprops-returns_/}

`UNSAFE_componentWillReceiveProps` should not return anything.

#### Caveats {/_unsafe_componentwillreceiveprops-caveats_/}

- `UNSAFE_componentWillReceiveProps` will not get called if the component implements [`static getDerivedStateFromProps`](#static-getderivedstatefromprops) or [`getSnapshotBeforeUpdate`.](#getsnapshotbeforeupdate)

- Despite its naming, `UNSAFE_componentWillReceiveProps` does not guarantee that the component _will_ receive those props if your app uses modern React features like [`Suspense`.](/reference/react/Suspense) If a render attempt is suspended (for example, because the code for some child component has not loaded yet), React will throw the in-progress tree away and attempt to construct the component from scratch during the next attempt. By the time of the next render attempt, the props might be different. This is why this method is "unsafe". Code that should run only for committed updates (like resetting a subscription) should go into [`componentDidUpdate`.](#componentdidupdate)

- `UNSAFE_componentWillReceiveProps` does not mean that the component has received _different_ props than the last time. You need to compare `nextProps` and `this.props` yourself to check if something changed.

- React doesn't call `UNSAFE_componentWillReceiveProps` with initial props during mounting. It only calls this method if some of component's props are going to be updated. For example, calling [`setState`](#setstate) doesn't generally trigger `UNSAFE_componentWillReceiveProps` inside the same component.

<Note>

Calling [`setState`](#setstate) inside `UNSAFE_componentWillReceiveProps` in a class component to "adjust" state is equivalent to [calling the `set` function from `useState` during rendering](/reference/react/useState#storing-information-from-previous-renders) in a function component.

</Note>

---

### `UNSAFE_componentWillUpdate(nextProps, nextState)` {/_unsafe_componentwillupdate_/}

If you define `UNSAFE_componentWillUpdate`, React will call it before rendering with the new props or state. It only exists for historical reasons and should not be used in any new code. Instead, use one of the alternatives:

- If you need to run a side effect (for example, fetch data, run an animation, or reinitialize a subscription) in response to prop or state changes, move that logic to [`componentDidUpdate`](#componentdidupdate) instead.
- If you need to read some information from the DOM (for example, to save the current scroll position) so that you can use it in [`componentDidUpdate`](#componentdidupdate) later, read it inside [`getSnapshotBeforeUpdate`](#getsnapshotbeforeupdate) instead.

[See examples of migrating away from unsafe lifecycles.](https://legacy.reactjs.org/blog/2018/03/27/update-on-async-rendering.html#examples)

#### Parameters {/_unsafe_componentwillupdate-parameters_/}

- `nextProps`: The next props that the component is about to render with. Compare `nextProps` to [`this.props`](#props) to determine what changed.
- `nextState`: The next state that the component is about to render with. Compare `nextState` to [`this.state`](#state) to determine what changed.

#### Returns {/_unsafe_componentwillupdate-returns_/}

`UNSAFE_componentWillUpdate` should not return anything.

#### Caveats {/_unsafe_componentwillupdate-caveats_/}

- `UNSAFE_componentWillUpdate` will not get called if [`shouldComponentUpdate`](#shouldcomponentupdate) is defined and returns `false`.

- `UNSAFE_componentWillUpdate` will not get called if the component implements [`static getDerivedStateFromProps`](#static-getderivedstatefromprops) or [`getSnapshotBeforeUpdate`.](#getsnapshotbeforeupdate)

- It's not supported to call [`setState`](#setstate) (or any method that leads to `setState` being called, like dispatching a Redux action) during `componentWillUpdate`.

- Despite its naming, `UNSAFE_componentWillUpdate` does not guarantee that the component _will_ update if your app uses modern React features like [`Suspense`.](/reference/react/Suspense) If a render attempt is suspended (for example, because the code for some child component has not loaded yet), React will throw the in-progress tree away and attempt to construct the component from scratch during the next attempt. By the time of the next render attempt, the props and state might be different. This is why this method is "unsafe". Code that should run only for committed updates (like resetting a subscription) should go into [`componentDidUpdate`.](#componentdidupdate)

- `UNSAFE_componentWillUpdate` does not mean that the component has received _different_ props or state than the last time. You need to compare `nextProps` with `this.props` and `nextState` with `this.state` yourself to check if something changed.

- React doesn't call `UNSAFE_componentWillUpdate` with initial props and state during mounting.

<Note>

There is no direct equivalent to `UNSAFE_componentWillUpdate` in function components.

</Note>

---

### `static contextType` {/_static-contexttype_/}

If you want to read [`this.context`](#context-instance-field) from your class component, you must specify which context it needs to read. The context you specify as the `static contextType` must be a value previously created by [`createContext`.](/reference/react/createContext)

```js {2}
class Button extends Component {
  static contextType = ThemeContext

  render() {
    const theme = this.context
    const className = 'button-' + theme
    return <button className={className}>{this.props.children}</button>
  }
}
```

<Note>

Reading `this.context` in class components is equivalent to [`useContext`](/reference/react/useContext) in function components.

[See how to migrate.](#migrating-a-component-with-context-from-a-class-to-a-function)

</Note>

---

### `static defaultProps` {/_static-defaultprops_/}

You can define `static defaultProps` to set the default props for the class. They will be used for `undefined` and missing props, but not for `null` props.

For example, here is how you define that the `color` prop should default to `'blue'`:

```js {2-4}
class Button extends Component {
  static defaultProps = {
    color: 'blue',
  }

  render() {
    return <button className={this.props.color}>click me</button>
  }
}
```

If the `color` prop is not provided or is `undefined`, it will be set by default to `'blue'`:

```js
<>
  {/* this.props.color is "blue" */}
  <Button />

  {/* this.props.color is "blue" */}
  <Button color={undefined} />

  {/* this.props.color is null */}
  <Button color={null} />

  {/* this.props.color is "red" */}
  <Button color="red" />
</>
```

<Note>

Defining `defaultProps` in class components is similar to using [default values](/learn/passing-props-to-a-component#specifying-a-default-value-for-a-prop) in function components.

</Note>

---

### `static getDerivedStateFromError(error)` {/_static-getderivedstatefromerror_/}

If you define `static getDerivedStateFromError`, React will call it when a child component (including distant children) throws an error during rendering. This lets you display an error message instead of clearing the UI.

Typically, it is used together with [`componentDidCatch`](#componentdidcatch) which lets you send the error report to some analytics service. A component with these methods is called an _Error Boundary_.

[See an example.](#catching-rendering-errors-with-an-error-boundary)

#### Parameters {/_static-getderivedstatefromerror-parameters_/}

- `error`: The error that was thrown. In practice, it will usually be an instance of [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) but this is not guaranteed because JavaScript allows to [`throw`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/throw) any value, including strings or even `null`.

#### Returns {/_static-getderivedstatefromerror-returns_/}

`static getDerivedStateFromError` should return the state telling the component to display the error message.

#### Caveats {/_static-getderivedstatefromerror-caveats_/}

- `static getDerivedStateFromError` should be a pure function. If you want to perform a side effect (for example, to call an analytics service), you need to also implement [`componentDidCatch`.](#componentdidcatch)

<Note>

There is no direct equivalent for `static getDerivedStateFromError` in function components yet. If you'd like to avoid creating class components, write a single `ErrorBoundary` component like above and use it throughout your app. Alternatively, use the [`react-error-boundary`](https://github.com/bvaughn/react-error-boundary) package which does that.

</Note>

---

### `static getDerivedStateFromProps(props, state)` {/_static-getderivedstatefromprops_/}

If you define `static getDerivedStateFromProps`, React will call it right before calling [`render`,](#render) both on the initial mount and on subsequent updates. It should return an object to update the state, or `null` to update nothing.

This method exists for [rare use cases](https://legacy.reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html#when-to-use-derived-state) where the state depends on changes in props over time. For example, this `Form` component resets the `email` state when the `userID` prop changes:

```js {7-18}
class Form extends Component {
  state = {
    email: this.props.defaultEmail,
    prevUserID: this.props.userID,
  }

  static getDerivedStateFromProps(props, state) {
    // Any time the current user changes,
    // Reset any parts of state that are tied to that user.
    // In this simple example, that's just the email.
    if (props.userID !== state.prevUserID) {
      return {
        prevUserID: props.userID,
        email: props.defaultEmail,
      }
    }
    return null
  }

  // ...
}
```

Note that this pattern requires you to keep a previous value of the prop (like `userID`) in state (like `prevUserID`).

<Pitfall>

Deriving state leads to verbose code and makes your components difficult to think about. [Make sure you're familiar with simpler alternatives:](https://legacy.reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html)

- If you need to **perform a side effect** (for example, data fetching or an animation) in response to a change in props, use [`componentDidUpdate`](#componentdidupdate) method instead.
- If you want to **re-compute some data only when a prop changes,** [use a memoization helper instead.](https://legacy.reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html#what-about-memoization)
- If you want to **"reset" some state when a prop changes,** consider either making a component [fully controlled](https://legacy.reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html#recommendation-fully-controlled-component) or [fully uncontrolled with a key](https://legacy.reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html#recommendation-fully-uncontrolled-component-with-a-key) instead.

</Pitfall>

#### Parameters {/_static-getderivedstatefromprops-parameters_/}

- `props`: The next props that the component is about to render with.
- `state`: The next state that the component is about to render with.

#### Returns {/_static-getderivedstatefromprops-returns_/}

`static getDerivedStateFromProps` return an object to update the state, or `null` to update nothing.

#### Caveats {/_static-getderivedstatefromprops-caveats_/}

- This method is fired on _every_ render, regardless of the cause. This is different from [`UNSAFE_componentWillReceiveProps`](#unsafe_cmoponentwillreceiveprops), which only fires when the parent causes a re-render and not as a result of a local `setState`.

- This method doesn't have access to the component instance. If you'd like, you can reuse some code between `static getDerivedStateFromProps` and the other class methods by extracting pure functions of the component props and state outside the class definition.

<Note>

Implementing `static getDerivedStateFromProps` in a class component is equivalent to [calling the `set` function from `useState` during rendering](/reference/react/useState#storing-information-from-previous-renders) in a function component.

</Note>

---

## Usage {/_usage_/}

### Defining a class component {/_defining-a-class-component_/}

To define a React component as a class, extend the built-in `Component` class and define a [`render` method:](#render)

```js
import { Component } from 'react'

class Greeting extends Component {
  render() {
    return <h1>Hello, {this.props.name}!</h1>
  }
}
```

React will call your [`render`](#render) method whenever it needs to figure out what to display on the screen. Usually, you will return some [JSX](/learn/writing-markup-with-jsx) from it. Your `render` method should be a [pure function:](https://en.wikipedia.org/wiki/Pure_function) it should only calculate the JSX.

Similarly to [function components,](/learn/your-first-component#defining-a-component) a class component can [receive information by props](/learn/your-first-component#defining-a-component) from its parent component. However, the syntax for reading props is different. For example, if the parent component renders `<Greeting name="Taylor" />`, then you can read the `name` prop from [`this.props`](#props), like `this.props.name`:

<Sandpack>

```js
import { Component } from 'react'

class Greeting extends Component {
  render() {
    return <h1>Hello, {this.props.name}!</h1>
  }
}

export default function App() {
  return (
    <>
      <Greeting name="Sara" />
      <Greeting name="Cahal" />
      <Greeting name="Edite" />
    </>
  )
}
```

</Sandpack>

Note that Hooks (functions starting with `use`, like [`useState`](/reference/react/useState)) are not supported inside class components.

<Pitfall>

We recommend defining components as functions instead of classes. [See how to migrate.](#migrating-a-simple-component-from-a-class-to-a-function)

</Pitfall>

---

### Adding state to a class component {/_adding-state-to-a-class-component_/}

To add [state](/learn/state-a-components-memory) to a class, assign an object to a property called [`state`](#state). To update state, call [`this.setState`](#setstate).

<Sandpack>

```js
import { Component } from 'react'

export default class Counter extends Component {
  state = {
    name: 'Taylor',
    age: 42,
  }

  handleNameChange = (e) => {
    this.setState({
      name: e.target.value,
    })
  }

  handleAgeChange = () => {
    this.setState({
      age: this.state.age + 1,
    })
  }

  render() {
    return (
      <>
        <input value={this.state.name} onChange={this.handleNameChange} />
        <button onClick={this.handleAgeChange}>Increment age</button>
        <p>
          Hello, {this.state.name}. You are {this.state.age}.
        </p>
      </>
    )
  }
}
```

```css
button {
  display: block;
  margin-top: 10px;
}
```

</Sandpack>

<Pitfall>

We recommend defining components as functions instead of classes. [See how to migrate.](#migrating-a-component-with-state-from-a-class-to-a-function)

</Pitfall>

---

### Adding lifecycle methods to a class component {/_adding-lifecycle-methods-to-a-class-component_/}

There are a few special methods you can define on your class.

If you define the [`componentDidMount`](#componentdidmount) method, React will call it when your component is added _(mounted)_ to the screen. React will call [`componentDidUpdate`](#componentdidupdate) after your component re-renders due to changed props or state. React will call [`componentWillUnmount`](#componentwillunmount) after your component has been removed _(unmounted)_ from the screen.

If you implement `componentDidMount`, you usually need to implement all three lifecycles to avoid bugs. For example, if `componentDidMount` reads some state or props, you also have to implement `componentDidUpdate` to handle their changes, and `componentWillUnmount` to clean up whatever `componentDidMount` was doing.

For example, this `ChatRoom` component keeps a chat connection synchronized with props and state:

<Sandpack>

```js src/App.js
import { useState } from 'react'
import ChatRoom from './ChatRoom.js'

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

```js src/ChatRoom.js active
import { Component } from 'react'
import { createConnection } from './chat.js'

export default class ChatRoom extends Component {
  state = {
    serverUrl: 'https://localhost:1234',
  }

  componentDidMount() {
    this.setupConnection()
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      this.props.roomId !== prevProps.roomId ||
      this.state.serverUrl !== prevState.serverUrl
    ) {
      this.destroyConnection()
      this.setupConnection()
    }
  }

  componentWillUnmount() {
    this.destroyConnection()
  }

  setupConnection() {
    this.connection = createConnection(this.state.serverUrl, this.props.roomId)
    this.connection.connect()
  }

  destroyConnection() {
    this.connection.disconnect()
    this.connection = null
  }

  render() {
    return (
      <>
        <label>
          Server URL:{' '}
          <input
            value={this.state.serverUrl}
            onChange={(e) => {
              this.setState({
                serverUrl: e.target.value,
              })
            }}
          />
        </label>
        <h1>Welcome to the {this.props.roomId} room!</h1>
      </>
    )
  }
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

Note that in development when [Strict Mode](/reference/react/StrictMode) is on, React will call `componentDidMount`, immediately call `componentWillUnmount`, and then call `componentDidMount` again. This helps you notice if you forgot to implement `componentWillUnmount` or if its logic doesn't fully "mirror" what `componentDidMount` does.

<Pitfall>

We recommend defining components as functions instead of classes. [See how to migrate.](#migrating-a-component-with-lifecycle-methods-from-a-class-to-a-function)

</Pitfall>

---

### Catching rendering errors with an Error Boundary {/_catching-rendering-errors-with-an-error-boundary_/}

By default, if your application throws an error during rendering, React will remove its UI from the screen. To prevent this, you can wrap a part of your UI into an _Error Boundary_. An Error Boundary is a special component that lets you display some fallback UI instead of the part that crashed--for example, an error message.

<Note>
Error boundaries do not catch errors for:

- Event handlers [(learn more)](/learn/responding-to-events)
- [Server side rendering](/reference/react-dom/server)
- Errors thrown in the error boundary itself (rather than its children)
- Asynchronous code (e.g. `setTimeout` or `requestAnimationFrame` callbacks); an exception is the usage of the [`startTransition`](/reference/react/useTransition#starttransition) function returned by the [`useTransition`](/reference/react/useTransition) Hook. Errors thrown inside the transition function are caught by error boundaries [(learn more)](/reference/react/useTransition#displaying-an-error-to-users-with-error-boundary)

</Note>

To implement an Error Boundary component, you need to provide [`static getDerivedStateFromError`](#static-getderivedstatefromerror) which lets you update state in response to an error and display an error message to the user. You can also optionally implement [`componentDidCatch`](#componentdidcatch) to add some extra logic, for example, to log the error to an analytics service.

With [`captureOwnerStack`](/reference/react/captureOwnerStack) you can include the Owner Stack during development.

```js {9-12,14-27}
import * as React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    logErrorToMyService(
      error,
      // Example "componentStack":
      //   in ComponentThatThrows (created by App)
      //   in ErrorBoundary (created by App)
      //   in div (created by App)
      //   in App
      info.componentStack,
      // Warning: `captureOwnerStack` is not available in production.
      React.captureOwnerStack()
    )
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return this.props.fallback
    }

    return this.props.children
  }
}
```

Then you can wrap a part of your component tree with it:

```js {1,3}
<ErrorBoundary fallback={<p>Something went wrong</p>}>
  <Profile />
</ErrorBoundary>
```

If `Profile` or its child component throws an error, `ErrorBoundary` will "catch" that error, display a fallback UI with the error message you've provided, and send a production error report to your error reporting service.

You don't need to wrap every component into a separate Error Boundary. When you think about the [granularity of Error Boundaries,](https://www.brandondail.com/posts/fault-tolerance-react) consider where it makes sense to display an error message. For example, in a messaging app, it makes sense to place an Error Boundary around the list of conversations. It also makes sense to place one around every individual message. However, it wouldn't make sense to place a boundary around every avatar.

<Note>

There is currently no way to write an Error Boundary as a function component. However, you don't have to write the Error Boundary class yourself. For example, you can use [`react-error-boundary`](https://github.com/bvaughn/react-error-boundary) instead.

</Note>

---

## Alternatives {/_alternatives_/}

### Migrating a simple component from a class to a function {/_migrating-a-simple-component-from-a-class-to-a-function_/}

Typically, you will [define components as functions](/learn/your-first-component#defining-a-component) instead.

For example, suppose you're converting this `Greeting` class component to a function:

<Sandpack>

```js
import { Component } from 'react'

class Greeting extends Component {
  render() {
    return <h1>Hello, {this.props.name}!</h1>
  }
}

export default function App() {
  return (
    <>
      <Greeting name="Sara" />
      <Greeting name="Cahal" />
      <Greeting name="Edite" />
    </>
  )
}
```

</Sandpack>

Define a function called `Greeting`. This is where you will move the body of your `render` function.

```js
function Greeting() {
  // ... move the code from the render method here ...
}
```

Instead of `this.props.name`, define the `name` prop [using the destructuring syntax](/learn/passing-props-to-a-component) and read it directly:

```js
function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>
}
```

Here is a complete example:

<Sandpack>

```js
function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>
}

export default function App() {
  return (
    <>
      <Greeting name="Sara" />
      <Greeting name="Cahal" />
      <Greeting name="Edite" />
    </>
  )
}
```

</Sandpack>

---

### Migrating a component with state from a class to a function {/_migrating-a-component-with-state-from-a-class-to-a-function_/}

Suppose you're converting this `Counter` class component to a function:

<Sandpack>

```js
import { Component } from 'react'

export default class Counter extends Component {
  state = {
    name: 'Taylor',
    age: 42,
  }

  handleNameChange = (e) => {
    this.setState({
      name: e.target.value,
    })
  }

  handleAgeChange = (e) => {
    this.setState({
      age: this.state.age + 1,
    })
  }

  render() {
    return (
      <>
        <input value={this.state.name} onChange={this.handleNameChange} />
        <button onClick={this.handleAgeChange}>Increment age</button>
        <p>
          Hello, {this.state.name}. You are {this.state.age}.
        </p>
      </>
    )
  }
}
```

```css
button {
  display: block;
  margin-top: 10px;
}
```

</Sandpack>

Start by declaring a function with the necessary [state variables:](/reference/react/useState#adding-state-to-a-component)

```js {4-5}
import { useState } from 'react';

function Counter() {
  const [name, setName] = useState('Taylor');
  const [age, setAge] = useState(42);
  // ...
```

Next, convert the event handlers:

```js {5-7,9-11}
function Counter() {
  const [name, setName] = useState('Taylor');
  const [age, setAge] = useState(42);

  function handleNameChange(e) {
    setName(e.target.value);
  }

  function handleAgeChange() {
    setAge(age + 1);
  }
  // ...
```

Finally, replace all references starting with `this` with the variables and functions you defined in your component. For example, replace `this.state.age` with `age`, and replace `this.handleNameChange` with `handleNameChange`.

Here is a fully converted component:

<Sandpack>

```js
import { useState } from 'react'

export default function Counter() {
  const [name, setName] = useState('Taylor')
  const [age, setAge] = useState(42)

  function handleNameChange(e) {
    setName(e.target.value)
  }

  function handleAgeChange() {
    setAge(age + 1)
  }

  return (
    <>
      <input value={name} onChange={handleNameChange} />
      <button onClick={handleAgeChange}>Increment age</button>
      <p>
        Hello, {name}. You are {age}.
      </p>
    </>
  )
}
```

```css
button {
  display: block;
  margin-top: 10px;
}
```

</Sandpack>

---

### Migrating a component with lifecycle methods from a class to a function {/_migrating-a-component-with-lifecycle-methods-from-a-class-to-a-function_/}

Suppose you're converting this `ChatRoom` class component with lifecycle methods to a function:

<Sandpack>

```js src/App.js
import { useState } from 'react'
import ChatRoom from './ChatRoom.js'

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

```js src/ChatRoom.js active
import { Component } from 'react'
import { createConnection } from './chat.js'

export default class ChatRoom extends Component {
  state = {
    serverUrl: 'https://localhost:1234',
  }

  componentDidMount() {
    this.setupConnection()
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      this.props.roomId !== prevProps.roomId ||
      this.state.serverUrl !== prevState.serverUrl
    ) {
      this.destroyConnection()
      this.setupConnection()
    }
  }

  componentWillUnmount() {
    this.destroyConnection()
  }

  setupConnection() {
    this.connection = createConnection(this.state.serverUrl, this.props.roomId)
    this.connection.connect()
  }

  destroyConnection() {
    this.connection.disconnect()
    this.connection = null
  }

  render() {
    return (
      <>
        <label>
          Server URL:{' '}
          <input
            value={this.state.serverUrl}
            onChange={(e) => {
              this.setState({
                serverUrl: e.target.value,
              })
            }}
          />
        </label>
        <h1>Welcome to the {this.props.roomId} room!</h1>
      </>
    )
  }
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

First, verify that your [`componentWillUnmount`](#componentwillunmount) does the opposite of [`componentDidMount`.](#componentdidmount) In the above example, that's true: it disconnects the connection that `componentDidMount` sets up. If such logic is missing, add it first.

Next, verify that your [`componentDidUpdate`](#componentdidupdate) method handles changes to any props and state you're using in `componentDidMount`. In the above example, `componentDidMount` calls `setupConnection` which reads `this.state.serverUrl` and `this.props.roomId`. This is why `componentDidUpdate` checks whether `this.state.serverUrl` and `this.props.roomId` have changed, and resets the connection if they did. If your `componentDidUpdate` logic is missing or doesn't handle changes to all relevant props and state, fix that first.

In the above example, the logic inside the lifecycle methods connects the component to a system outside of React (a chat server). To connect a component to an external system, [describe this logic as a single Effect:](/reference/react/useEffect#connecting-to-an-external-system)

```js {6-12}
import { useState, useEffect } from 'react'

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

This [`useEffect`](/reference/react/useEffect) call is equivalent to the logic in the lifecycle methods above. If your lifecycle methods do multiple unrelated things, [split them into multiple independent Effects.](/learn/removing-effect-dependencies#is-your-effect-doing-several-unrelated-things) Here is a complete example you can play with:

<Sandpack>

```js src/App.js
import { useState } from 'react'
import ChatRoom from './ChatRoom.js'

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

```js src/ChatRoom.js active
import { useState, useEffect } from 'react'
import { createConnection } from './chat.js'

export default function ChatRoom({ roomId }) {
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

<Note>

If your component does not synchronize with any external systems, [you might not need an Effect.](/learn/you-might-not-need-an-effect)

</Note>

---

### Migrating a component with context from a class to a function {/_migrating-a-component-with-context-from-a-class-to-a-function_/}

In this example, the `Panel` and `Button` class components read [context](/learn/passing-data-deeply-with-context) from [`this.context`:](#context)

<Sandpack>

```js
import { createContext, Component } from 'react'

const ThemeContext = createContext(null)

class Panel extends Component {
  static contextType = ThemeContext

  render() {
    const theme = this.context
    const className = 'panel-' + theme
    return (
      <section className={className}>
        <h1>{this.props.title}</h1>
        {this.props.children}
      </section>
    )
  }
}

class Button extends Component {
  static contextType = ThemeContext

  render() {
    const theme = this.context
    const className = 'button-' + theme
    return <button className={className}>{this.props.children}</button>
  }
}

function Form() {
  return (
    <Panel title="Welcome">
      <Button>Sign up</Button>
      <Button>Log in</Button>
    </Panel>
  )
}

export default function MyApp() {
  return (
    <ThemeContext value="dark">
      <Form />
    </ThemeContext>
  )
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

When you convert them to function components, replace `this.context` with [`useContext`](/reference/react/useContext) calls:

<Sandpack>

```js
import { createContext, useContext } from 'react'

const ThemeContext = createContext(null)

function Panel({ title, children }) {
  const theme = useContext(ThemeContext)
  const className = 'panel-' + theme
  return (
    <section className={className}>
      <h1>{title}</h1>
      {children}
    </section>
  )
}

function Button({ children }) {
  const theme = useContext(ThemeContext)
  const className = 'button-' + theme
  return <button className={className}>{children}</button>
}

function Form() {
  return (
    <Panel title="Welcome">
      <Button>Sign up</Button>
      <Button>Log in</Button>
    </Panel>
  )
}

export default function MyApp() {
  return (
    <ThemeContext value="dark">
      <Form />
    </ThemeContext>
  )
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
