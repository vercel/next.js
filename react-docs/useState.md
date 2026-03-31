---
title: useState
---

<Intro>

`useState` is a React Hook that lets you add a [state variable](/learn/state-a-components-memory) to your component.

```js
const [state, setState] = useState(initialState)
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useState(initialState)` {/_usestate_/}

Call `useState` at the top level of your component to declare a [state variable.](/learn/state-a-components-memory)

```js
import { useState } from 'react';

function MyComponent() {
  const [age, setAge] = useState(28);
  const [name, setName] = useState('Taylor');
  const [todos, setTodos] = useState(() => createTodos());
  // ...
```

The convention is to name state variables like `[something, setSomething]` using [array destructuring.](https://javascript.info/destructuring-assignment)

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `initialState`: The value you want the state to be initially. It can be a value of any type, but there is a special behavior for functions. This argument is ignored after the initial render.
  - If you pass a function as `initialState`, it will be treated as an _initializer function_. It should be pure, should take no arguments, and should return a value of any type. React will call your initializer function when initializing the component, and store its return value as the initial state. [See an example below.](#avoiding-recreating-the-initial-state)

#### Returns {/_returns_/}

`useState` returns an array with exactly two values:

1. The current state. During the first render, it will match the `initialState` you have passed.
2. The [`set` function](#setstate) that lets you update the state to a different value and trigger a re-render.

#### Caveats {/_caveats_/}

- `useState` is a Hook, so you can only call it **at the top level of your component** or your own Hooks. You can't call it inside loops or conditions. If you need that, extract a new component and move the state into it.
- In Strict Mode, React will **call your initializer function twice** in order to [help you find accidental impurities.](#my-initializer-or-updater-function-runs-twice) This is development-only behavior and does not affect production. If your initializer function is pure (as it should be), this should not affect the behavior. The result from one of the calls will be ignored.

---

### `set` functions, like `setSomething(nextState)` {/_setstate_/}

The `set` function returned by `useState` lets you update the state to a different value and trigger a re-render. You can pass the next state directly, or a function that calculates it from the previous state:

```js
const [name, setName] = useState('Edward');

function handleClick() {
  setName('Taylor');
  setAge(a => a + 1);
  // ...
```

#### Parameters {/_setstate-parameters_/}

- `nextState`: The value that you want the state to be. It can be a value of any type, but there is a special behavior for functions.
  - If you pass a function as `nextState`, it will be treated as an _updater function_. It must be pure, should take the pending state as its only argument, and should return the next state. React will put your updater function in a queue and re-render your component. During the next render, React will calculate the next state by applying all of the queued updaters to the previous state. [See an example below.](#updating-state-based-on-the-previous-state)

#### Returns {/_setstate-returns_/}

`set` functions do not have a return value.

#### Caveats {/_setstate-caveats_/}

- The `set` function **only updates the state variable for the _next_ render**. If you read the state variable after calling the `set` function, [you will still get the old value](#ive-updated-the-state-but-logging-gives-me-the-old-value) that was on the screen before your call.

- If the new value you provide is identical to the current `state`, as determined by an [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) comparison, React will **skip re-rendering the component and its children.** This is an optimization. Although in some cases React may still need to call your component before skipping the children, it shouldn't affect your code.

- React [batches state updates.](/learn/queueing-a-series-of-state-updates) It updates the screen **after all the event handlers have run** and have called their `set` functions. This prevents multiple re-renders during a single event. In the rare case that you need to force React to update the screen earlier, for example to access the DOM, you can use [`flushSync`.](/reference/react-dom/flushSync)

- The `set` function has a stable identity, so you will often see it omitted from Effect dependencies, but including it will not cause the Effect to fire. If the linter lets you omit a dependency without errors, it is safe to do. [Learn more about removing Effect dependencies.](/learn/removing-effect-dependencies#move-dynamic-objects-and-functions-inside-your-effect)

- Calling the `set` function _during rendering_ is only allowed from within the currently rendering component. React will discard its output and immediately attempt to render it again with the new state. This pattern is rarely needed, but you can use it to **store information from the previous renders**. [See an example below.](#storing-information-from-previous-renders)

- In Strict Mode, React will **call your updater function twice** in order to [help you find accidental impurities.](#my-initializer-or-updater-function-runs-twice) This is development-only behavior and does not affect production. If your updater function is pure (as it should be), this should not affect the behavior. The result from one of the calls will be ignored.

---

## Usage {/_usage_/}

### Adding state to a component {/_adding-state-to-a-component_/}

Call `useState` at the top level of your component to declare one or more [state variables.](/learn/state-a-components-memory)

```js [[1, 4, "age"], [2, 4, "setAge"], [3, 4, "42"], [1, 5, "name"], [2, 5, "setName"], [3, 5, "'Taylor'"]]
import { useState } from 'react';

function MyComponent() {
  const [age, setAge] = useState(42);
  const [name, setName] = useState('Taylor');
  // ...
```

The convention is to name state variables like `[something, setSomething]` using [array destructuring.](https://javascript.info/destructuring-assignment)

`useState` returns an array with exactly two items:

1. The <CodeStep step={1}>current state</CodeStep> of this state variable, initially set to the <CodeStep step={3}>initial state</CodeStep> you provided.
2. The <CodeStep step={2}>`set` function</CodeStep> that lets you change it to any other value in response to interaction.

To update what’s on the screen, call the `set` function with some next state:

```js [[2, 2, "setName"]]
function handleClick() {
  setName('Robin')
}
```

React will store the next state, render your component again with the new values, and update the UI.

<Pitfall>

Calling the `set` function [**does not** change the current state in the already executing code](#ive-updated-the-state-but-logging-gives-me-the-old-value):

```js {3}
function handleClick() {
  setName('Robin')
  console.log(name) // Still "Taylor"!
}
```

It only affects what `useState` will return starting from the _next_ render.

</Pitfall>

<Recipes titleText="Basic useState examples" titleId="examples-basic">

#### Counter (number) {/_counter-number_/}

In this example, the `count` state variable holds a number. Clicking the button increments it.

<Sandpack>

```js
import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)

  function handleClick() {
    setCount(count + 1)
  }

  return <button onClick={handleClick}>You pressed me {count} times</button>
}
```

</Sandpack>

<Solution />

#### Text field (string) {/_text-field-string_/}

In this example, the `text` state variable holds a string. When you type, `handleChange` reads the latest input value from the browser input DOM element, and calls `setText` to update the state. This allows you to display the current `text` below.

<Sandpack>

```js
import { useState } from 'react'

export default function MyInput() {
  const [text, setText] = useState('hello')

  function handleChange(e) {
    setText(e.target.value)
  }

  return (
    <>
      <input value={text} onChange={handleChange} />
      <p>You typed: {text}</p>
      <button onClick={() => setText('hello')}>Reset</button>
    </>
  )
}
```

</Sandpack>

<Solution />

#### Checkbox (boolean) {/_checkbox-boolean_/}

In this example, the `liked` state variable holds a boolean. When you click the input, `setLiked` updates the `liked` state variable with whether the browser checkbox input is checked. The `liked` variable is used to render the text below the checkbox.

<Sandpack>

```js
import { useState } from 'react'

export default function MyCheckbox() {
  const [liked, setLiked] = useState(true)

  function handleChange(e) {
    setLiked(e.target.checked)
  }

  return (
    <>
      <label>
        <input type="checkbox" checked={liked} onChange={handleChange} />I liked
        this
      </label>
      <p>You {liked ? 'liked' : 'did not like'} this.</p>
    </>
  )
}
```

</Sandpack>

<Solution />

#### Form (two variables) {/_form-two-variables_/}

You can declare more than one state variable in the same component. Each state variable is completely independent.

<Sandpack>

```js
import { useState } from 'react'

export default function Form() {
  const [name, setName] = useState('Taylor')
  const [age, setAge] = useState(42)

  return (
    <>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={() => setAge(age + 1)}>Increment age</button>
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

<Solution />

</Recipes>

---

### Updating state based on the previous state {/_updating-state-based-on-the-previous-state_/}

Suppose the `age` is `42`. This handler calls `setAge(age + 1)` three times:

```js
function handleClick() {
  setAge(age + 1) // setAge(42 + 1)
  setAge(age + 1) // setAge(42 + 1)
  setAge(age + 1) // setAge(42 + 1)
}
```

However, after one click, `age` will only be `43` rather than `45`! This is because calling the `set` function [does not update](/learn/state-as-a-snapshot) the `age` state variable in the already running code. So each `setAge(age + 1)` call becomes `setAge(43)`.

To solve this problem, **you may pass an _updater function_** to `setAge` instead of the next state:

```js [[1, 2, "a", 0], [2, 2, "a + 1"], [1, 3, "a", 0], [2, 3, "a + 1"], [1, 4, "a", 0], [2, 4, "a + 1"]]
function handleClick() {
  setAge((a) => a + 1) // setAge(42 => 43)
  setAge((a) => a + 1) // setAge(43 => 44)
  setAge((a) => a + 1) // setAge(44 => 45)
}
```

Here, `a => a + 1` is your updater function. It takes the <CodeStep step={1}>pending state</CodeStep> and calculates the <CodeStep step={2}>next state</CodeStep> from it.

React puts your updater functions in a [queue.](/learn/queueing-a-series-of-state-updates) Then, during the next render, it will call them in the same order:

1. `a => a + 1` will receive `42` as the pending state and return `43` as the next state.
1. `a => a + 1` will receive `43` as the pending state and return `44` as the next state.
1. `a => a + 1` will receive `44` as the pending state and return `45` as the next state.

There are no other queued updates, so React will store `45` as the current state in the end.

By convention, it's common to name the pending state argument for the first letter of the state variable name, like `a` for `age`. However, you may also call it like `prevAge` or something else that you find clearer.

React may [call your updaters twice](#my-initializer-or-updater-function-runs-twice) in development to verify that they are [pure.](/learn/keeping-components-pure)

<DeepDive>

#### Is using an updater always preferred? {/_is-using-an-updater-always-preferred_/}

You might hear a recommendation to always write code like `setAge(a => a + 1)` if the state you're setting is calculated from the previous state. There is no harm in it, but it is also not always necessary.

In most cases, there is no difference between these two approaches. React always makes sure that for intentional user actions, like clicks, the `age` state variable would be updated before the next click. This means there is no risk of a click handler seeing a "stale" `age` at the beginning of the event handler.

However, if you do multiple updates within the same event, updaters can be helpful. They're also helpful if accessing the state variable itself is inconvenient (you might run into this when optimizing re-renders).

If you prefer consistency over slightly more verbose syntax, it's reasonable to always write an updater if the state you're setting is calculated from the previous state. If it's calculated from the previous state of some _other_ state variable, you might want to combine them into one object and [use a reducer.](/learn/extracting-state-logic-into-a-reducer)

</DeepDive>

<Recipes titleText="The difference between passing an updater and passing the next state directly" titleId="examples-updater">

#### Passing the updater function {/_passing-the-updater-function_/}

This example passes the updater function, so the "+3" button works.

<Sandpack>

```js
import { useState } from 'react'

export default function Counter() {
  const [age, setAge] = useState(42)

  function increment() {
    setAge((a) => a + 1)
  }

  return (
    <>
      <h1>Your age: {age}</h1>
      <button
        onClick={() => {
          increment()
          increment()
          increment()
        }}
      >
        +3
      </button>
      <button
        onClick={() => {
          increment()
        }}
      >
        +1
      </button>
    </>
  )
}
```

```css
button {
  display: block;
  margin: 10px;
  font-size: 20px;
}
h1 {
  display: block;
  margin: 10px;
}
```

</Sandpack>

<Solution />

#### Passing the next state directly {/_passing-the-next-state-directly_/}

This example **does not** pass the updater function, so the "+3" button **doesn't work as intended**.

<Sandpack>

```js
import { useState } from 'react'

export default function Counter() {
  const [age, setAge] = useState(42)

  function increment() {
    setAge(age + 1)
  }

  return (
    <>
      <h1>Your age: {age}</h1>
      <button
        onClick={() => {
          increment()
          increment()
          increment()
        }}
      >
        +3
      </button>
      <button
        onClick={() => {
          increment()
        }}
      >
        +1
      </button>
    </>
  )
}
```

```css
button {
  display: block;
  margin: 10px;
  font-size: 20px;
}
h1 {
  display: block;
  margin: 10px;
}
```

</Sandpack>

<Solution />

</Recipes>

---

### Updating objects and arrays in state {/_updating-objects-and-arrays-in-state_/}

You can put objects and arrays into state. In React, state is considered read-only, so **you should _replace_ it rather than _mutate_ your existing objects**. For example, if you have a `form` object in state, don't mutate it:

```js
// 🚩 Don't mutate an object in state like this:
form.firstName = 'Taylor'
```

Instead, replace the whole object by creating a new one:

```js
// ✅ Replace state with a new object
setForm({
  ...form,
  firstName: 'Taylor',
})
```

Read [updating objects in state](/learn/updating-objects-in-state) and [updating arrays in state](/learn/updating-arrays-in-state) to learn more.

<Recipes titleText="Examples of objects and arrays in state" titleId="examples-objects">

#### Form (object) {/_form-object_/}

In this example, the `form` state variable holds an object. Each input has a change handler that calls `setForm` with the next state of the entire form. The `{ ...form }` spread syntax ensures that the state object is replaced rather than mutated.

<Sandpack>

```js
import { useState } from 'react'

export default function Form() {
  const [form, setForm] = useState({
    firstName: 'Barbara',
    lastName: 'Hepworth',
    email: 'bhepworth@sculpture.com',
  })

  return (
    <>
      <label>
        First name:
        <input
          value={form.firstName}
          onChange={(e) => {
            setForm({
              ...form,
              firstName: e.target.value,
            })
          }}
        />
      </label>
      <label>
        Last name:
        <input
          value={form.lastName}
          onChange={(e) => {
            setForm({
              ...form,
              lastName: e.target.value,
            })
          }}
        />
      </label>
      <label>
        Email:
        <input
          value={form.email}
          onChange={(e) => {
            setForm({
              ...form,
              email: e.target.value,
            })
          }}
        />
      </label>
      <p>
        {form.firstName} {form.lastName} ({form.email})
      </p>
    </>
  )
}
```

```css
label {
  display: block;
}
input {
  margin-left: 5px;
}
```

</Sandpack>

<Solution />

#### Form (nested object) {/_form-nested-object_/}

In this example, the state is more nested. When you update nested state, you need to create a copy of the object you're updating, as well as any objects "containing" it on the way upwards. Read [updating a nested object](/learn/updating-objects-in-state#updating-a-nested-object) to learn more.

<Sandpack>

```js
import { useState } from 'react'

export default function Form() {
  const [person, setPerson] = useState({
    name: 'Niki de Saint Phalle',
    artwork: {
      title: 'Blue Nana',
      city: 'Hamburg',
      image: 'https://i.imgur.com/Sd1AgUOm.jpg',
    },
  })

  function handleNameChange(e) {
    setPerson({
      ...person,
      name: e.target.value,
    })
  }

  function handleTitleChange(e) {
    setPerson({
      ...person,
      artwork: {
        ...person.artwork,
        title: e.target.value,
      },
    })
  }

  function handleCityChange(e) {
    setPerson({
      ...person,
      artwork: {
        ...person.artwork,
        city: e.target.value,
      },
    })
  }

  function handleImageChange(e) {
    setPerson({
      ...person,
      artwork: {
        ...person.artwork,
        image: e.target.value,
      },
    })
  }

  return (
    <>
      <label>
        Name:
        <input value={person.name} onChange={handleNameChange} />
      </label>
      <label>
        Title:
        <input value={person.artwork.title} onChange={handleTitleChange} />
      </label>
      <label>
        City:
        <input value={person.artwork.city} onChange={handleCityChange} />
      </label>
      <label>
        Image:
        <input value={person.artwork.image} onChange={handleImageChange} />
      </label>
      <p>
        <i>{person.artwork.title}</i>
        {' by '}
        {person.name}
        <br />
        (located in {person.artwork.city})
      </p>
      <img src={person.artwork.image} alt={person.artwork.title} />
    </>
  )
}
```

```css
label {
  display: block;
}
input {
  margin-left: 5px;
  margin-bottom: 5px;
}
img {
  width: 200px;
  height: 200px;
}
```

</Sandpack>

<Solution />

#### List (array) {/_list-array_/}

In this example, the `todos` state variable holds an array. Each button handler calls `setTodos` with the next version of that array. The `[...todos]` spread syntax, `todos.map()` and `todos.filter()` ensure the state array is replaced rather than mutated.

<Sandpack>

```js src/App.js
import { useState } from 'react'
import AddTodo from './AddTodo.js'
import TaskList from './TaskList.js'

let nextId = 3
const initialTodos = [
  { id: 0, title: 'Buy milk', done: true },
  { id: 1, title: 'Eat tacos', done: false },
  { id: 2, title: 'Brew tea', done: false },
]

export default function TaskApp() {
  const [todos, setTodos] = useState(initialTodos)

  function handleAddTodo(title) {
    setTodos([
      ...todos,
      {
        id: nextId++,
        title: title,
        done: false,
      },
    ])
  }

  function handleChangeTodo(nextTodo) {
    setTodos(
      todos.map((t) => {
        if (t.id === nextTodo.id) {
          return nextTodo
        } else {
          return t
        }
      })
    )
  }

  function handleDeleteTodo(todoId) {
    setTodos(todos.filter((t) => t.id !== todoId))
  }

  return (
    <>
      <AddTodo onAddTodo={handleAddTodo} />
      <TaskList
        todos={todos}
        onChangeTodo={handleChangeTodo}
        onDeleteTodo={handleDeleteTodo}
      />
    </>
  )
}
```

```js src/AddTodo.js
import { useState } from 'react'

export default function AddTodo({ onAddTodo }) {
  const [title, setTitle] = useState('')
  return (
    <>
      <input
        placeholder="Add todo"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button
        onClick={() => {
          setTitle('')
          onAddTodo(title)
        }}
      >
        Add
      </button>
    </>
  )
}
```

```js src/TaskList.js
import { useState } from 'react'

export default function TaskList({ todos, onChangeTodo, onDeleteTodo }) {
  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          <Task todo={todo} onChange={onChangeTodo} onDelete={onDeleteTodo} />
        </li>
      ))}
    </ul>
  )
}

function Task({ todo, onChange, onDelete }) {
  const [isEditing, setIsEditing] = useState(false)
  let todoContent
  if (isEditing) {
    todoContent = (
      <>
        <input
          value={todo.title}
          onChange={(e) => {
            onChange({
              ...todo,
              title: e.target.value,
            })
          }}
        />
        <button onClick={() => setIsEditing(false)}>Save</button>
      </>
    )
  } else {
    todoContent = (
      <>
        {todo.title}
        <button onClick={() => setIsEditing(true)}>Edit</button>
      </>
    )
  }
  return (
    <label>
      <input
        type="checkbox"
        checked={todo.done}
        onChange={(e) => {
          onChange({
            ...todo,
            done: e.target.checked,
          })
        }}
      />
      {todoContent}
      <button onClick={() => onDelete(todo.id)}>Delete</button>
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

#### Writing concise update logic with Immer {/_writing-concise-update-logic-with-immer_/}

If updating arrays and objects without mutation feels tedious, you can use a library like [Immer](https://github.com/immerjs/use-immer) to reduce repetitive code. Immer lets you write concise code as if you were mutating objects, but under the hood it performs immutable updates:

<Sandpack>

```js
import { useState } from 'react'
import { useImmer } from 'use-immer'

let nextId = 3
const initialList = [
  { id: 0, title: 'Big Bellies', seen: false },
  { id: 1, title: 'Lunar Landscape', seen: false },
  { id: 2, title: 'Terracotta Army', seen: true },
]

export default function BucketList() {
  const [list, updateList] = useImmer(initialList)

  function handleToggle(artworkId, nextSeen) {
    updateList((draft) => {
      const artwork = draft.find((a) => a.id === artworkId)
      artwork.seen = nextSeen
    })
  }

  return (
    <>
      <h1>Art Bucket List</h1>
      <h2>My list of art to see:</h2>
      <ItemList artworks={list} onToggle={handleToggle} />
    </>
  )
}

function ItemList({ artworks, onToggle }) {
  return (
    <ul>
      {artworks.map((artwork) => (
        <li key={artwork.id}>
          <label>
            <input
              type="checkbox"
              checked={artwork.seen}
              onChange={(e) => {
                onToggle(artwork.id, e.target.checked)
              }}
            />
            {artwork.title}
          </label>
        </li>
      ))}
    </ul>
  )
}
```

```json package.json
{
  "dependencies": {
    "immer": "1.7.3",
    "react": "latest",
    "react-dom": "latest",
    "react-scripts": "latest",
    "use-immer": "0.5.1"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test --env=jsdom",
    "eject": "react-scripts eject"
  }
}
```

</Sandpack>

<Solution />

</Recipes>

---

### Avoiding recreating the initial state {/_avoiding-recreating-the-initial-state_/}

React saves the initial state once and ignores it on the next renders.

```js
function TodoList() {
  const [todos, setTodos] = useState(createInitialTodos());
  // ...
```

Although the result of `createInitialTodos()` is only used for the initial render, you're still calling this function on every render. This can be wasteful if it's creating large arrays or performing expensive calculations.

To solve this, you may **pass it as an _initializer_ function** to `useState` instead:

```js
function TodoList() {
  const [todos, setTodos] = useState(createInitialTodos);
  // ...
```

Notice that you’re passing `createInitialTodos`, which is the _function itself_, and not `createInitialTodos()`, which is the result of calling it. If you pass a function to `useState`, React will only call it during initialization.

React may [call your initializers twice](#my-initializer-or-updater-function-runs-twice) in development to verify that they are [pure.](/learn/keeping-components-pure)

<Recipes titleText="The difference between passing an initializer and passing the initial state directly" titleId="examples-initializer">

#### Passing the initializer function {/_passing-the-initializer-function_/}

This example passes the initializer function, so the `createInitialTodos` function only runs during initialization. It does not run when component re-renders, such as when you type into the input.

<Sandpack>

```js
import { useState } from 'react'

function createInitialTodos() {
  const initialTodos = []
  for (let i = 0; i < 50; i++) {
    initialTodos.push({
      id: i,
      text: 'Item ' + (i + 1),
    })
  }
  return initialTodos
}

export default function TodoList() {
  const [todos, setTodos] = useState(createInitialTodos)
  const [text, setText] = useState('')

  return (
    <>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button
        onClick={() => {
          setText('')
          setTodos([
            {
              id: todos.length,
              text: text,
            },
            ...todos,
          ])
        }}
      >
        Add
      </button>
      <ul>
        {todos.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </>
  )
}
```

</Sandpack>

<Solution />

#### Passing the initial state directly {/_passing-the-initial-state-directly_/}

This example **does not** pass the initializer function, so the `createInitialTodos` function runs on every render, such as when you type into the input. There is no observable difference in behavior, but this code is less efficient.

<Sandpack>

```js
import { useState } from 'react'

function createInitialTodos() {
  const initialTodos = []
  for (let i = 0; i < 50; i++) {
    initialTodos.push({
      id: i,
      text: 'Item ' + (i + 1),
    })
  }
  return initialTodos
}

export default function TodoList() {
  const [todos, setTodos] = useState(createInitialTodos())
  const [text, setText] = useState('')

  return (
    <>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button
        onClick={() => {
          setText('')
          setTodos([
            {
              id: todos.length,
              text: text,
            },
            ...todos,
          ])
        }}
      >
        Add
      </button>
      <ul>
        {todos.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </>
  )
}
```

</Sandpack>

<Solution />

</Recipes>

---

### Resetting state with a key {/_resetting-state-with-a-key_/}

You'll often encounter the `key` attribute when [rendering lists.](/learn/rendering-lists) However, it also serves another purpose.

You can **reset a component's state by passing a different `key` to a component.** In this example, the Reset button changes the `version` state variable, which we pass as a `key` to the `Form`. When the `key` changes, React re-creates the `Form` component (and all of its children) from scratch, so its state gets reset.

Read [preserving and resetting state](/learn/preserving-and-resetting-state) to learn more.

<Sandpack>

```js src/App.js
import { useState } from 'react'

export default function App() {
  const [version, setVersion] = useState(0)

  function handleReset() {
    setVersion(version + 1)
  }

  return (
    <>
      <button onClick={handleReset}>Reset</button>
      <Form key={version} />
    </>
  )
}

function Form() {
  const [name, setName] = useState('Taylor')

  return (
    <>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <p>Hello, {name}.</p>
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

---

### Storing information from previous renders {/_storing-information-from-previous-renders_/}

Usually, you will update state in event handlers. However, in rare cases you might want to adjust state in response to rendering -- for example, you might want to change a state variable when a prop changes.

In most cases, you don't need this:

- **If the value you need can be computed entirely from the current props or other state, [remove that redundant state altogether.](/learn/choosing-the-state-structure#avoid-redundant-state)** If you're worried about recomputing too often, the [`useMemo` Hook](/reference/react/useMemo) can help.
- If you want to reset the entire component tree's state, [pass a different `key` to your component.](#resetting-state-with-a-key)
- If you can, update all the relevant state in the event handlers.

In the rare case that none of these apply, there is a pattern you can use to update state based on the values that have been rendered so far, by calling a `set` function while your component is rendering.

Here's an example. This `CountLabel` component displays the `count` prop passed to it:

```js src/CountLabel.js
export default function CountLabel({ count }) {
  return <h1>{count}</h1>
}
```

Say you want to show whether the counter has _increased or decreased_ since the last change. The `count` prop doesn't tell you this -- you need to keep track of its previous value. Add the `prevCount` state variable to track it. Add another state variable called `trend` to hold whether the count has increased or decreased. Compare `prevCount` with `count`, and if they're not equal, update both `prevCount` and `trend`. Now you can show both the current count prop and _how it has changed since the last render_.

<Sandpack>

```js src/App.js
import { useState } from 'react'
import CountLabel from './CountLabel.js'

export default function App() {
  const [count, setCount] = useState(0)
  return (
    <>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <button onClick={() => setCount(count - 1)}>Decrement</button>
      <CountLabel count={count} />
    </>
  )
}
```

```js src/CountLabel.js active
import { useState } from 'react'

export default function CountLabel({ count }) {
  const [prevCount, setPrevCount] = useState(count)
  const [trend, setTrend] = useState(null)
  if (prevCount !== count) {
    setPrevCount(count)
    setTrend(count > prevCount ? 'increasing' : 'decreasing')
  }
  return (
    <>
      <h1>{count}</h1>
      {trend && <p>The count is {trend}</p>}
    </>
  )
}
```

```css
button {
  margin-bottom: 10px;
}
```

</Sandpack>

Note that if you call a `set` function while rendering, it must be inside a condition like `prevCount !== count`, and there must be a call like `setPrevCount(count)` inside of the condition. Otherwise, your component would re-render in a loop until it crashes. Also, you can only update the state of the _currently rendering_ component like this. Calling the `set` function of _another_ component during rendering is an error. Finally, your `set` call should still [update state without mutation](#updating-objects-and-arrays-in-state) -- this doesn't mean you can break other rules of [pure functions.](/learn/keeping-components-pure)

This pattern can be hard to understand and is usually best avoided. However, it's better than updating state in an effect. When you call the `set` function during render, React will re-render that component immediately after your component exits with a `return` statement, and before rendering the children. This way, children don't need to render twice. The rest of your component function will still execute (and the result will be thrown away). If your condition is below all the Hook calls, you may add an early `return;` to restart rendering earlier.

---

## Troubleshooting {/_troubleshooting_/}

### I've updated the state, but logging gives me the old value {/_ive-updated-the-state-but-logging-gives-me-the-old-value_/}

Calling the `set` function **does not change state in the running code**:

```js {4,5,8}
function handleClick() {
  console.log(count) // 0

  setCount(count + 1) // Request a re-render with 1
  console.log(count) // Still 0!

  setTimeout(() => {
    console.log(count) // Also 0!
  }, 5000)
}
```

This is because [states behaves like a snapshot.](/learn/state-as-a-snapshot) Updating state requests another render with the new state value, but does not affect the `count` JavaScript variable in your already-running event handler.

If you need to use the next state, you can save it in a variable before passing it to the `set` function:

```js
const nextCount = count + 1
setCount(nextCount)

console.log(count) // 0
console.log(nextCount) // 1
```

---

### I've updated the state, but the screen doesn't update {/_ive-updated-the-state-but-the-screen-doesnt-update_/}

React will **ignore your update if the next state is equal to the previous state,** as determined by an [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) comparison. This usually happens when you change an object or an array in state directly:

```js
obj.x = 10 // 🚩 Wrong: mutating existing object
setObj(obj) // 🚩 Doesn't do anything
```

You mutated an existing `obj` object and passed it back to `setObj`, so React ignored the update. To fix this, you need to ensure that you're always [_replacing_ objects and arrays in state instead of _mutating_ them](#updating-objects-and-arrays-in-state):

```js
// ✅ Correct: creating a new object
setObj({
  ...obj,
  x: 10,
})
```

---

### I'm getting an error: "Too many re-renders" {/_im-getting-an-error-too-many-re-renders_/}

You might get an error that says: `Too many re-renders. React limits the number of renders to prevent an infinite loop.` Typically, this means that you're unconditionally setting state _during render_, so your component enters a loop: render, set state (which causes a render), render, set state (which causes a render), and so on. Very often, this is caused by a mistake in specifying an event handler:

```js {1-2}
// 🚩 Wrong: calls the handler during render
return <button onClick={handleClick()}>Click me</button>

// ✅ Correct: passes down the event handler
return <button onClick={handleClick}>Click me</button>

// ✅ Correct: passes down an inline function
return <button onClick={(e) => handleClick(e)}>Click me</button>
```

If you can't find the cause of this error, click on the arrow next to the error in the console and look through the JavaScript stack to find the specific `set` function call responsible for the error.

---

### My initializer or updater function runs twice {/_my-initializer-or-updater-function-runs-twice_/}

In [Strict Mode](/reference/react/StrictMode), React will call some of your functions twice instead of once:

```js {2,5-6,11-12}
function TodoList() {
  // This component function will run twice for every render.

  const [todos, setTodos] = useState(() => {
    // This initializer function will run twice during initialization.
    return createTodos();
  });

  function handleClick() {
    setTodos(prevTodos => {
      // This updater function will run twice for every click.
      return [...prevTodos, createTodo()];
    });
  }
  // ...
```

This is expected and shouldn't break your code.

This **development-only** behavior helps you [keep components pure.](/learn/keeping-components-pure) React uses the result of one of the calls, and ignores the result of the other call. As long as your component, initializer, and updater functions are pure, this shouldn't affect your logic. However, if they are accidentally impure, this helps you notice the mistakes.

For example, this impure updater function mutates an array in state:

```js {2,3}
setTodos((prevTodos) => {
  // 🚩 Mistake: mutating state
  prevTodos.push(createTodo())
})
```

Because React calls your updater function twice, you'll see the todo was added twice, so you'll know that there is a mistake. In this example, you can fix the mistake by [replacing the array instead of mutating it](#updating-objects-and-arrays-in-state):

```js {2,3}
setTodos((prevTodos) => {
  // ✅ Correct: replacing with new state
  return [...prevTodos, createTodo()]
})
```

Now that this updater function is pure, calling it an extra time doesn't make a difference in behavior. This is why React calling it twice helps you find mistakes. **Only component, initializer, and updater functions need to be pure.** Event handlers don't need to be pure, so React will never call your event handlers twice.

Read [keeping components pure](/learn/keeping-components-pure) to learn more.

---

### I'm trying to set state to a function, but it gets called instead {/_im-trying-to-set-state-to-a-function-but-it-gets-called-instead_/}

You can't put a function into state like this:

```js
const [fn, setFn] = useState(someFunction)

function handleClick() {
  setFn(someOtherFunction)
}
```

Because you're passing a function, React assumes that `someFunction` is an [initializer function](#avoiding-recreating-the-initial-state), and that `someOtherFunction` is an [updater function](#updating-state-based-on-the-previous-state), so it tries to call them and store the result. To actually _store_ a function, you have to put `() =>` before them in both cases. Then React will store the functions you pass.

```js {1,4}
const [fn, setFn] = useState(() => someFunction)

function handleClick() {
  setFn(() => someOtherFunction)
}
```
