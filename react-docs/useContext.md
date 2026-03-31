---
title: useContext
---

<Intro>

`useContext` is a React Hook that lets you read and subscribe to [context](/learn/passing-data-deeply-with-context) from your component.

```js
const value = useContext(SomeContext)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useContext(SomeContext)` {/_usecontext_/}

Call `useContext` at the top level of your component to read and subscribe to [context.](/learn/passing-data-deeply-with-context)

```js
import { useContext } from 'react';

function MyComponent() {
  const theme = useContext(ThemeContext);
  // ...
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `SomeContext`: The context that you've previously created with [`createContext`](/reference/react/createContext). The context itself does not hold the information, it only represents the kind of information you can provide or read from components.

#### Returns {/_returns_/}

`useContext` returns the context value for the calling component. It is determined as the `value` passed to the closest `SomeContext` above the calling component in the tree. If there is no such provider, then the returned value will be the `defaultValue` you have passed to [`createContext`](/reference/react/createContext) for that context. The returned value is always up-to-date. React automatically re-renders components that read some context if it changes.

#### Caveats {/_caveats_/}

- `useContext()` call in a component is not affected by providers returned from the _same_ component. The corresponding `<Context>` **needs to be _above_** the component doing the `useContext()` call.
- React **automatically re-renders** all the children that use a particular context starting from the provider that receives a different `value`. The previous and the next values are compared with the [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) comparison. Skipping re-renders with [`memo`](/reference/react/memo) does not prevent the children receiving fresh context values.
- If your build system produces duplicates modules in the output (which can happen with symlinks), this can break context. Passing something via context only works if `SomeContext` that you use to provide context and `SomeContext` that you use to read it are **_exactly_ the same object**, as determined by a `===` comparison.

---

## Usage {/_usage_/}

### Passing data deeply into the tree {/_passing-data-deeply-into-the-tree_/}

Call `useContext` at the top level of your component to read and subscribe to [context.](/learn/passing-data-deeply-with-context)

```js [[2, 4, "theme"], [1, 4, "ThemeContext"]]
import { useContext } from 'react';

function Button() {
  const theme = useContext(ThemeContext);
  // ...
```

`useContext` returns the <CodeStep step={2}>context value</CodeStep> for the <CodeStep step={1}>context</CodeStep> you passed. To determine the context value, React searches the component tree and finds **the closest context provider above** for that particular context.

To pass context to a `Button`, wrap it or one of its parent components into the corresponding context provider:

```js [[1, 3, "ThemeContext"], [2, 3, ""dark""], [1, 5, "ThemeContext"]]
function MyPage() {
  return (
    <ThemeContext value="dark">
      <Form />
    </ThemeContext>
  )
}

function Form() {
  // ... renders buttons inside ...
}
```

It doesn't matter how many layers of components there are between the provider and the `Button`. When a `Button` _anywhere_ inside of `Form` calls `useContext(ThemeContext)`, it will receive `"dark"` as the value.

<Pitfall>

`useContext()` always looks for the closest provider _above_ the component that calls it. It searches upwards and **does not** consider providers in the component from which you're calling `useContext()`.

</Pitfall>

<Sandpack>

```js
import { createContext, useContext } from 'react'

const ThemeContext = createContext(null)

export default function MyApp() {
  return (
    <ThemeContext value="dark">
      <Form />
    </ThemeContext>
  )
}

function Form() {
  return (
    <Panel title="Welcome">
      <Button>Sign up</Button>
      <Button>Log in</Button>
    </Panel>
  )
}

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

---

### Updating data passed via context {/_updating-data-passed-via-context_/}

Often, you'll want the context to change over time. To update context, combine it with [state.](/reference/react/useState) Declare a state variable in the parent component, and pass the current state down as the <CodeStep step={2}>context value</CodeStep> to the provider.

```js {2} [[1, 4, "ThemeContext"], [2, 4, "theme"], [1, 11, "ThemeContext"]]
function MyPage() {
  const [theme, setTheme] = useState('dark')
  return (
    <ThemeContext value={theme}>
      <Form />
      <Button
        onClick={() => {
          setTheme('light')
        }}
      >
        Switch to light theme
      </Button>
    </ThemeContext>
  )
}
```

Now any `Button` inside of the provider will receive the current `theme` value. If you call `setTheme` to update the `theme` value that you pass to the provider, all `Button` components will re-render with the new `'light'` value.

<Recipes titleText="Examples of updating context" titleId="examples-basic">

#### Updating a value via context {/_updating-a-value-via-context_/}

In this example, the `MyApp` component holds a state variable which is then passed to the `ThemeContext` provider. Checking the "Dark mode" checkbox updates the state. Changing the provided value re-renders all the components using that context.

<Sandpack>

```js
import { createContext, useContext, useState } from 'react'

const ThemeContext = createContext(null)

export default function MyApp() {
  const [theme, setTheme] = useState('light')
  return (
    <ThemeContext value={theme}>
      <Form />
      <label>
        <input
          type="checkbox"
          checked={theme === 'dark'}
          onChange={(e) => {
            setTheme(e.target.checked ? 'dark' : 'light')
          }}
        />
        Use dark mode
      </label>
    </ThemeContext>
  )
}

function Form({ children }) {
  return (
    <Panel title="Welcome">
      <Button>Sign up</Button>
      <Button>Log in</Button>
    </Panel>
  )
}

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
```

```css
.panel-light,
.panel-dark {
  border: 1px solid black;
  border-radius: 4px;
  padding: 20px;
  margin-bottom: 10px;
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

Note that `value="dark"` passes the `"dark"` string, but `value={theme}` passes the value of the JavaScript `theme` variable with [JSX curly braces.](/learn/javascript-in-jsx-with-curly-braces) Curly braces also let you pass context values that aren't strings.

<Solution />

#### Updating an object via context {/_updating-an-object-via-context_/}

In this example, there is a `currentUser` state variable which holds an object. You combine `{ currentUser, setCurrentUser }` into a single object and pass it down through the context inside the `value={}`. This lets any component below, such as `LoginButton`, read both `currentUser` and `setCurrentUser`, and then call `setCurrentUser` when needed.

<Sandpack>

```js
import { createContext, useContext, useState } from 'react'

const CurrentUserContext = createContext(null)

export default function MyApp() {
  const [currentUser, setCurrentUser] = useState(null)
  return (
    <CurrentUserContext
      value={{
        currentUser,
        setCurrentUser,
      }}
    >
      <Form />
    </CurrentUserContext>
  )
}

function Form({ children }) {
  return (
    <Panel title="Welcome">
      <LoginButton />
    </Panel>
  )
}

function LoginButton() {
  const { currentUser, setCurrentUser } = useContext(CurrentUserContext)

  if (currentUser !== null) {
    return <p>You logged in as {currentUser.name}.</p>
  }

  return (
    <Button
      onClick={() => {
        setCurrentUser({ name: 'Advika' })
      }}
    >
      Log in as Advika
    </Button>
  )
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h1>{title}</h1>
      {children}
    </section>
  )
}

function Button({ children, onClick }) {
  return (
    <button className="button" onClick={onClick}>
      {children}
    </button>
  )
}
```

```css
label {
  display: block;
}

.panel {
  border: 1px solid black;
  border-radius: 4px;
  padding: 20px;
  margin-bottom: 10px;
}

.button {
  border: 1px solid #777;
  padding: 5px;
  margin-right: 10px;
  margin-top: 10px;
}
```

</Sandpack>

<Solution />

#### Multiple contexts {/_multiple-contexts_/}

In this example, there are two independent contexts. `ThemeContext` provides the current theme, which is a string, while `CurrentUserContext` holds the object representing the current user.

<Sandpack>

```js
import { createContext, useContext, useState } from 'react'

const ThemeContext = createContext(null)
const CurrentUserContext = createContext(null)

export default function MyApp() {
  const [theme, setTheme] = useState('light')
  const [currentUser, setCurrentUser] = useState(null)
  return (
    <ThemeContext value={theme}>
      <CurrentUserContext
        value={{
          currentUser,
          setCurrentUser,
        }}
      >
        <WelcomePanel />
        <label>
          <input
            type="checkbox"
            checked={theme === 'dark'}
            onChange={(e) => {
              setTheme(e.target.checked ? 'dark' : 'light')
            }}
          />
          Use dark mode
        </label>
      </CurrentUserContext>
    </ThemeContext>
  )
}

function WelcomePanel({ children }) {
  const { currentUser } = useContext(CurrentUserContext)
  return (
    <Panel title="Welcome">
      {currentUser !== null ? <Greeting /> : <LoginForm />}
    </Panel>
  )
}

function Greeting() {
  const { currentUser } = useContext(CurrentUserContext)
  return <p>You logged in as {currentUser.name}.</p>
}

function LoginForm() {
  const { setCurrentUser } = useContext(CurrentUserContext)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const canLogin = firstName.trim() !== '' && lastName.trim() !== ''
  return (
    <>
      <label>
        First name{': '}
        <input
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </label>
      <label>
        Last name{': '}
        <input
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </label>
      <Button
        disabled={!canLogin}
        onClick={() => {
          setCurrentUser({
            name: firstName + ' ' + lastName,
          })
        }}
      >
        Log in
      </Button>
      {!canLogin && <i>Fill in both fields.</i>}
    </>
  )
}

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

function Button({ children, disabled, onClick }) {
  const theme = useContext(ThemeContext)
  const className = 'button-' + theme
  return (
    <button className={className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
```

```css
label {
  display: block;
}

.panel-light,
.panel-dark {
  border: 1px solid black;
  border-radius: 4px;
  padding: 20px;
  margin-bottom: 10px;
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

<Solution />

#### Extracting providers to a component {/_extracting-providers-to-a-component_/}

As your app grows, it is expected that you'll have a "pyramid" of contexts closer to the root of your app. There is nothing wrong with that. However, if you dislike the nesting aesthetically, you can extract the providers into a single component. In this example, `MyProviders` hides the "plumbing" and renders the children passed to it inside the necessary providers. Note that the `theme` and `setTheme` state is needed in `MyApp` itself, so `MyApp` still owns that piece of the state.

<Sandpack>

```js
import { createContext, useContext, useState } from 'react'

const ThemeContext = createContext(null)
const CurrentUserContext = createContext(null)

export default function MyApp() {
  const [theme, setTheme] = useState('light')
  return (
    <MyProviders theme={theme} setTheme={setTheme}>
      <WelcomePanel />
      <label>
        <input
          type="checkbox"
          checked={theme === 'dark'}
          onChange={(e) => {
            setTheme(e.target.checked ? 'dark' : 'light')
          }}
        />
        Use dark mode
      </label>
    </MyProviders>
  )
}

function MyProviders({ children, theme, setTheme }) {
  const [currentUser, setCurrentUser] = useState(null)
  return (
    <ThemeContext value={theme}>
      <CurrentUserContext
        value={{
          currentUser,
          setCurrentUser,
        }}
      >
        {children}
      </CurrentUserContext>
    </ThemeContext>
  )
}

function WelcomePanel({ children }) {
  const { currentUser } = useContext(CurrentUserContext)
  return (
    <Panel title="Welcome">
      {currentUser !== null ? <Greeting /> : <LoginForm />}
    </Panel>
  )
}

function Greeting() {
  const { currentUser } = useContext(CurrentUserContext)
  return <p>You logged in as {currentUser.name}.</p>
}

function LoginForm() {
  const { setCurrentUser } = useContext(CurrentUserContext)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const canLogin = firstName !== '' && lastName !== ''
  return (
    <>
      <label>
        First name{': '}
        <input
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </label>
      <label>
        Last name{': '}
        <input
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </label>
      <Button
        disabled={!canLogin}
        onClick={() => {
          setCurrentUser({
            name: firstName + ' ' + lastName,
          })
        }}
      >
        Log in
      </Button>
      {!canLogin && <i>Fill in both fields.</i>}
    </>
  )
}

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

function Button({ children, disabled, onClick }) {
  const theme = useContext(ThemeContext)
  const className = 'button-' + theme
  return (
    <button className={className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
```

```css
label {
  display: block;
}

.panel-light,
.panel-dark {
  border: 1px solid black;
  border-radius: 4px;
  padding: 20px;
  margin-bottom: 10px;
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

<Solution />

#### Scaling up with context and a reducer {/_scaling-up-with-context-and-a-reducer_/}

In larger apps, it is common to combine context with a [reducer](/reference/react/useReducer) to extract the logic related to some state out of components. In this example, all the "wiring" is hidden in the `TasksContext.js`, which contains a reducer and two separate contexts.

Read a [full walkthrough](/learn/scaling-up-with-reducer-and-context) of this example.

<Sandpack>

```js src/App.js
import AddTask from './AddTask.js'
import TaskList from './TaskList.js'
import { TasksProvider } from './TasksContext.js'

export default function TaskApp() {
  return (
    <TasksProvider>
      <h1>Day off in Kyoto</h1>
      <AddTask />
      <TaskList />
    </TasksProvider>
  )
}
```

```js src/TasksContext.js
import { createContext, useContext, useReducer } from 'react'

const TasksContext = createContext(null)

const TasksDispatchContext = createContext(null)

export function TasksProvider({ children }) {
  const [tasks, dispatch] = useReducer(tasksReducer, initialTasks)

  return (
    <TasksContext value={tasks}>
      <TasksDispatchContext value={dispatch}>{children}</TasksDispatchContext>
    </TasksContext>
  )
}

export function useTasks() {
  return useContext(TasksContext)
}

export function useTasksDispatch() {
  return useContext(TasksDispatchContext)
}

function tasksReducer(tasks, action) {
  switch (action.type) {
    case 'added': {
      return [
        ...tasks,
        {
          id: action.id,
          text: action.text,
          done: false,
        },
      ]
    }
    case 'changed': {
      return tasks.map((t) => {
        if (t.id === action.task.id) {
          return action.task
        } else {
          return t
        }
      })
    }
    case 'deleted': {
      return tasks.filter((t) => t.id !== action.id)
    }
    default: {
      throw Error('Unknown action: ' + action.type)
    }
  }
}

const initialTasks = [
  { id: 0, text: 'Philosopher’s Path', done: true },
  { id: 1, text: 'Visit the temple', done: false },
  { id: 2, text: 'Drink matcha', done: false },
]
```

```js src/AddTask.js
import { useState, useContext } from 'react'
import { useTasksDispatch } from './TasksContext.js'

export default function AddTask() {
  const [text, setText] = useState('')
  const dispatch = useTasksDispatch()
  return (
    <>
      <input
        placeholder="Add task"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        onClick={() => {
          setText('')
          dispatch({
            type: 'added',
            id: nextId++,
            text: text,
          })
        }}
      >
        Add
      </button>
    </>
  )
}

let nextId = 3
```

```js src/TaskList.js
import { useState, useContext } from 'react'
import { useTasks, useTasksDispatch } from './TasksContext.js'

export default function TaskList() {
  const tasks = useTasks()
  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>
          <Task task={task} />
        </li>
      ))}
    </ul>
  )
}

function Task({ task }) {
  const [isEditing, setIsEditing] = useState(false)
  const dispatch = useTasksDispatch()
  let taskContent
  if (isEditing) {
    taskContent = (
      <>
        <input
          value={task.text}
          onChange={(e) => {
            dispatch({
              type: 'changed',
              task: {
                ...task,
                text: e.target.value,
              },
            })
          }}
        />
        <button onClick={() => setIsEditing(false)}>Save</button>
      </>
    )
  } else {
    taskContent = (
      <>
        {task.text}
        <button onClick={() => setIsEditing(true)}>Edit</button>
      </>
    )
  }
  return (
    <label>
      <input
        type="checkbox"
        checked={task.done}
        onChange={(e) => {
          dispatch({
            type: 'changed',
            task: {
              ...task,
              done: e.target.checked,
            },
          })
        }}
      />
      {taskContent}
      <button
        onClick={() => {
          dispatch({
            type: 'deleted',
            id: task.id,
          })
        }}
      >
        Delete
      </button>
    </label>
  )
}
```

```css
button {
  margin: 5px;
}
li {
  list-style-type: none;
}
ul,
li {
  margin: 0;
  padding: 0;
}
```

</Sandpack>

<Solution />

</Recipes>

---

### Specifying a fallback default value {/_specifying-a-fallback-default-value_/}

If React can't find any providers of that particular <CodeStep step={1}>context</CodeStep> in the parent tree, the context value returned by `useContext()` will be equal to the <CodeStep step={3}>default value</CodeStep> that you specified when you [created that context](/reference/react/createContext):

```js [[1, 1, "ThemeContext"], [3, 1, "null"]]
const ThemeContext = createContext(null)
```

The default value **never changes**. If you want to update context, use it with state as [described above.](#updating-data-passed-via-context)

Often, instead of `null`, there is some more meaningful value you can use as a default, for example:

```js [[1, 1, "ThemeContext"], [3, 1, "light"]]
const ThemeContext = createContext('light')
```

This way, if you accidentally render some component without a corresponding provider, it won't break. This also helps your components work well in a test environment without setting up a lot of providers in the tests.

In the example below, the "Toggle theme" button is always light because it's **outside any theme context provider** and the default context theme value is `'light'`. Try editing the default theme to be `'dark'`.

<Sandpack>

```js
import { createContext, useContext, useState } from 'react'

const ThemeContext = createContext('light')

export default function MyApp() {
  const [theme, setTheme] = useState('light')
  return (
    <>
      <ThemeContext value={theme}>
        <Form />
      </ThemeContext>
      <Button
        onClick={() => {
          setTheme(theme === 'dark' ? 'light' : 'dark')
        }}
      >
        Toggle theme
      </Button>
    </>
  )
}

function Form({ children }) {
  return (
    <Panel title="Welcome">
      <Button>Sign up</Button>
      <Button>Log in</Button>
    </Panel>
  )
}

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

function Button({ children, onClick }) {
  const theme = useContext(ThemeContext)
  const className = 'button-' + theme
  return (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  )
}
```

```css
.panel-light,
.panel-dark {
  border: 1px solid black;
  border-radius: 4px;
  padding: 20px;
  margin-bottom: 10px;
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

---

### Overriding context for a part of the tree {/_overriding-context-for-a-part-of-the-tree_/}

You can override the context for a part of the tree by wrapping that part in a provider with a different value.

```js {3,5}
<ThemeContext value="dark">
  ...
  <ThemeContext value="light">
    <Footer />
  </ThemeContext>
  ...
</ThemeContext>
```

You can nest and override providers as many times as you need.

<Recipes titleText="Examples of overriding context">

#### Overriding a theme {/_overriding-a-theme_/}

Here, the button _inside_ the `Footer` receives a different context value (`"light"`) than the buttons outside (`"dark"`).

<Sandpack>

```js
import { createContext, useContext } from 'react'

const ThemeContext = createContext(null)

export default function MyApp() {
  return (
    <ThemeContext value="dark">
      <Form />
    </ThemeContext>
  )
}

function Form() {
  return (
    <Panel title="Welcome">
      <Button>Sign up</Button>
      <Button>Log in</Button>
      <ThemeContext value="light">
        <Footer />
      </ThemeContext>
    </Panel>
  )
}

function Footer() {
  return (
    <footer>
      <Button>Settings</Button>
    </footer>
  )
}

function Panel({ title, children }) {
  const theme = useContext(ThemeContext)
  const className = 'panel-' + theme
  return (
    <section className={className}>
      {title && <h1>{title}</h1>}
      {children}
    </section>
  )
}

function Button({ children }) {
  const theme = useContext(ThemeContext)
  const className = 'button-' + theme
  return <button className={className}>{children}</button>
}
```

```css
footer {
  margin-top: 20px;
  border-top: 1px solid #aaa;
}

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

<Solution />

#### Automatically nested headings {/_automatically-nested-headings_/}

You can "accumulate" information when you nest context providers. In this example, the `Section` component keeps track of the `LevelContext` which specifies the depth of the section nesting. It reads the `LevelContext` from the parent section, and provides the `LevelContext` number increased by one to its children. As a result, the `Heading` component can automatically decide which of the `<h1>`, `<h2>`, `<h3>`, ..., tags to use based on how many `Section` components it is nested inside of.

Read a [detailed walkthrough](/learn/passing-data-deeply-with-context) of this example.

<Sandpack>

```js
import Heading from './Heading.js'
import Section from './Section.js'

export default function Page() {
  return (
    <Section>
      <Heading>Title</Heading>
      <Section>
        <Heading>Heading</Heading>
        <Heading>Heading</Heading>
        <Heading>Heading</Heading>
        <Section>
          <Heading>Sub-heading</Heading>
          <Heading>Sub-heading</Heading>
          <Heading>Sub-heading</Heading>
          <Section>
            <Heading>Sub-sub-heading</Heading>
            <Heading>Sub-sub-heading</Heading>
            <Heading>Sub-sub-heading</Heading>
          </Section>
        </Section>
      </Section>
    </Section>
  )
}
```

```js src/Section.js
import { useContext } from 'react'
import { LevelContext } from './LevelContext.js'

export default function Section({ children }) {
  const level = useContext(LevelContext)
  return (
    <section className="section">
      <LevelContext value={level + 1}>{children}</LevelContext>
    </section>
  )
}
```

```js src/Heading.js
import { useContext } from 'react'
import { LevelContext } from './LevelContext.js'

export default function Heading({ children }) {
  const level = useContext(LevelContext)
  switch (level) {
    case 0:
      throw Error('Heading must be inside a Section!')
    case 1:
      return <h1>{children}</h1>
    case 2:
      return <h2>{children}</h2>
    case 3:
      return <h3>{children}</h3>
    case 4:
      return <h4>{children}</h4>
    case 5:
      return <h5>{children}</h5>
    case 6:
      return <h6>{children}</h6>
    default:
      throw Error('Unknown level: ' + level)
  }
}
```

```js src/LevelContext.js
import { createContext } from 'react'

export const LevelContext = createContext(0)
```

```css
.section {
  padding: 10px;
  margin: 5px;
  border-radius: 5px;
  border: 1px solid #aaa;
}
```

</Sandpack>

<Solution />

</Recipes>

---

### Optimizing re-renders when passing objects and functions {/_optimizing-re-renders-when-passing-objects-and-functions_/}

You can pass any values via context, including objects and functions.

```js [[2, 10, "{ currentUser, login }"]]
function MyApp() {
  const [currentUser, setCurrentUser] = useState(null)

  function login(response) {
    storeCredentials(response.credentials)
    setCurrentUser(response.user)
  }

  return (
    <AuthContext value={{ currentUser, login }}>
      <Page />
    </AuthContext>
  )
}
```

Here, the <CodeStep step={2}>context value</CodeStep> is a JavaScript object with two properties, one of which is a function. Whenever `MyApp` re-renders (for example, on a route update), this will be a _different_ object pointing at a _different_ function, so React will also have to re-render all components deep in the tree that call `useContext(AuthContext)`.

In smaller apps, this is not a problem. However, there is no need to re-render them if the underlying data, like `currentUser`, has not changed. To help React take advantage of that fact, you may wrap the `login` function with [`useCallback`](/reference/react/useCallback) and wrap the object creation into [`useMemo`](/reference/react/useMemo). This is a performance optimization:

```js {6,9,11,14,17}
import { useCallback, useMemo } from 'react'

function MyApp() {
  const [currentUser, setCurrentUser] = useState(null)

  const login = useCallback((response) => {
    storeCredentials(response.credentials)
    setCurrentUser(response.user)
  }, [])

  const contextValue = useMemo(
    () => ({
      currentUser,
      login,
    }),
    [currentUser, login]
  )

  return (
    <AuthContext value={contextValue}>
      <Page />
    </AuthContext>
  )
}
```

As a result of this change, even if `MyApp` needs to re-render, the components calling `useContext(AuthContext)` won't need to re-render unless `currentUser` has changed.

Read more about [`useMemo`](/reference/react/useMemo#skipping-re-rendering-of-components) and [`useCallback`.](/reference/react/useCallback#skipping-re-rendering-of-components)

---

## Troubleshooting {/_troubleshooting_/}

### My component doesn't see the value from my provider {/_my-component-doesnt-see-the-value-from-my-provider_/}

There are a few common ways that this can happen:

1. You're rendering `<SomeContext>` in the same component (or below) as where you're calling `useContext()`. Move `<SomeContext>` _above and outside_ the component calling `useContext()`.
2. You may have forgotten to wrap your component with `<SomeContext>`, or you might have put it in a different part of the tree than you thought. Check whether the hierarchy is right using [React DevTools.](/learn/react-developer-tools)
3. You might be running into some build issue with your tooling that causes `SomeContext` as seen from the providing component and `SomeContext` as seen by the reading component to be two different objects. This can happen if you use symlinks, for example. You can verify this by assigning them to globals like `window.SomeContext1` and `window.SomeContext2` and then checking whether `window.SomeContext1 === window.SomeContext2` in the console. If they're not the same, fix that issue on the build tool level.

### I am always getting `undefined` from my context although the default value is different {/_i-am-always-getting-undefined-from-my-context-although-the-default-value-is-different_/}

You might have a provider without a `value` in the tree:

```js {1,2}
// 🚩 Doesn't work: no value prop
<ThemeContext>
  <Button />
</ThemeContext>
```

If you forget to specify `value`, it's like passing `value={undefined}`.

You may have also mistakingly used a different prop name by mistake:

```js {1,2}
// 🚩 Doesn't work: prop should be called "value"
<ThemeContext theme={theme}>
  <Button />
</ThemeContext>
```

In both of these cases you should see a warning from React in the console. To fix them, call the prop `value`:

```js {1,2}
// ✅ Passing the value prop
<ThemeContext value={theme}>
  <Button />
</ThemeContext>
```

Note that the [default value from your `createContext(defaultValue)` call](#specifying-a-fallback-default-value) is only used **if there is no matching provider above at all.** If there is a `<SomeContext value={undefined}>` component somewhere in the parent tree, the component calling `useContext(SomeContext)` _will_ receive `undefined` as the context value.
