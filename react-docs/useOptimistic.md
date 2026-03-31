---
title: useOptimistic
---

<Intro>

`useOptimistic` is a React Hook that lets you optimistically update the UI.

```js
const [optimisticState, setOptimistic] = useOptimistic(value, reducer?);
```

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `useOptimistic(value, reducer?)` {/_useoptimistic_/}

Call `useOptimistic` at the top level of your component to create optimistic state for a value.

```js
import { useOptimistic } from 'react'

function MyComponent({ name, todos }) {
  const [optimisticAge, setOptimisticAge] = useOptimistic(28)
  const [optimisticName, setOptimisticName] = useOptimistic(name)
  const [optimisticTodos, setOptimisticTodos] = useOptimistic(
    todos,
    todoReducer
  )
  // ...
}
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `value`: The value returned when there are no pending Actions.
- **optional** `reducer(currentState, action)`: The reducer function that specifies how the optimistic state gets updated. It must be pure, should take the current state and reducer action arguments, and should return the next optimistic state.

#### Returns {/_returns_/}

`useOptimistic` returns an array with exactly two values:

1. `optimisticState`: The current optimistic state. It is equal to `value` unless an Action is pending, in which case it is equal to the state returned by `reducer` (or the value passed to the set function if no `reducer` was provided).
2. The [`set` function](#setoptimistic) that lets you update the optimistic state to a different value inside an Action.

---

### `set` functions, like `setOptimistic(optimisticState)` {/_setoptimistic_/}

The `set` function returned by `useOptimistic` lets you update the state for the duration of an [Action](reference/react/useTransition#functions-called-in-starttransition-are-called-actions). You can pass the next state directly, or a function that calculates it from the previous state:

```js
const [optimisticLike, setOptimisticLike] = useOptimistic(false)
const [optimisticSubs, setOptimisticSubs] = useOptimistic(subs)

function handleClick() {
  startTransition(async () => {
    setOptimisticLike(true)
    setOptimisticSubs((a) => a + 1)
    await saveChanges()
  })
}
```

#### Parameters {/_setoptimistic-parameters_/}

- `optimisticState`: The value that you want the optimistic state to be during an [Action](reference/react/useTransition#functions-called-in-starttransition-are-called-actions). If you provided a `reducer` to `useOptimistic`, this value will be passed as the second argument to your reducer. It can be a value of any type.
  - If you pass a function as `optimisticState`, it will be treated as an _updater function_. It must be pure, should take the pending state as its only argument, and should return the next optimistic state. React will put your updater function in a queue and re-render your component. During the next render, React will calculate the next state by applying the queued updaters to the previous state similar to [`useState` updaters](/reference/react/useState#setstate-parameters).

#### Returns {/_setoptimistic-returns_/}

`set` functions do not have a return value.

#### Caveats {/_setoptimistic-caveats_/}

- The `set` function must be called inside an [Action](reference/react/useTransition#functions-called-in-starttransition-are-called-actions). If you call the setter outside an Action, [React will show a warning](#an-optimistic-state-update-occurred-outside-a-transition-or-action) and the optimistic state will briefly render.

<DeepDive>

#### How optimistic state works {/_how-optimistic-state-works_/}

`useOptimistic` lets you show a temporary value while a Action is in progress:

```js
const [value, setValue] = useState('a')
const [optimistic, setOptimistic] = useOptimistic(value)

startTransition(async () => {
  setOptimistic('b')
  const newValue = await saveChanges('b')
  setValue(newValue)
})
```

When the setter is called inside an Action, `useOptimistic` will trigger a re-render to show that state while the Action is in progress. Otherwise, the `value` passed to `useOptimistic` is returned.

This state is called the "optimistic" because it is used to immediately present the user with the result of performing an Action, even though the Action actually takes time to complete.

**How the update flows**

1. **Update immediately**: When `setOptimistic('b')` is called, React immediately renders with `'b'`.

2. **(Optional) await in Action**: If you await in the Action, React continues showing `'b'`.

3. **Transition scheduled**: `setValue(newValue)` schedules an update to the real state.

4. **(Optional) wait for Suspense**: If `newValue` suspends, React continues showing `'b'`.

5. **Single render commit**: Finally, the `newValue` commits for `value` and `optimistic`.

There's no extra render to "clear" the optimistic state. The optimistic and real state converge in the same render when the Transition completes.

<Note>

#### Optimistic state is temporary {/_optimistic-state-is-temporary_/}

Optimistic state only renders while an Action is in progress, otherwise `value` is rendered.

If `saveChanges` returned `'c'`, then both `value` and `optimistic` will be `'c'`, not `'b'`.

</Note>

**How the final state is determined**

The `value` argument to `useOptimistic` determines what displays after the Action finishes. How this works depends on the pattern you use:

- **Hardcoded values** like `useOptimistic(false)`: After the Action, `state` is still `false`, so the UI shows `false`. This is useful for pending states where you always start from `false`.

- **Props or state passed in** like `useOptimistic(isLiked)`: If the parent updates `isLiked` during the Action, the new value is used after the Action completes. This is how the UI reflects the result of the Action.

- **Reducer pattern** like `useOptimistic(items, fn)`: If `items` changes while the Action is pending, React re-runs your `reducer` with the new `items` to recalculate the state. This keeps your optimistic additions on top of the latest data.

**What happens when the Action fails**

If the Action throws an error, the Transition still ends, and React renders with whatever `value` currently is. Since the parent typically only updates `value` on success, a failure means `value` hasn't changed, so the UI shows what it showed before the optimistic update. You can catch the error to show a message to the user.

</DeepDive>

---

## Usage {/_usage_/}

### Adding optimistic state to a component {/_adding-optimistic-state-to-a-component_/}

Call `useOptimistic` at the top level of your component to declare one or more optimistic states.

```js [[1, 4, "age"], [1, 5, "name"], [1, 6, "todos"], [2, 4, "optimisticAge"], [2, 5, "optimisticName"], [2, 6, "optimisticTodos"], [3, 4, "setOptimisticAge"], [3, 5, "setOptimisticName"], [3, 6, "setOptimisticTodos"], [4, 6, "reducer"]]
import { useOptimistic } from 'react';

function MyComponent({age, name, todos}) {
  const [optimisticAge, setOptimisticAge] = useOptimistic(age);
  const [optimisticName, setOptimisticName] = useOptimistic(name);
  const [optimisticTodos, setOptimisticTodos] = useOptimistic(todos, reducer);
  // ...
```

`useOptimistic` returns an array with exactly two items:

1. The <CodeStep step={2}>optimistic state</CodeStep>, initially set to the <CodeStep step={1}>value</CodeStep> provided.
2. The <CodeStep step={3}>set function</CodeStep> that lets you temporarily change the state during an [Action](reference/react/useTransition#functions-called-in-starttransition-are-called-actions).
   - If a <CodeStep step={4}>reducer</CodeStep> is provided, it will run before returning the optimistic state.

To use the <CodeStep step={2}>optimistic state</CodeStep>, call the `set` function inside an Action.

Actions are functions called inside `startTransition`:

```js {3}
function onAgeChange(e) {
  startTransition(async () => {
    setOptimisticAge(42)
    const newAge = await postAge(42)
    setAge(newAge)
  })
}
```

React will render the optimistic state `42` first while the `age` remains the current age. The Action waits for POST, and then renders the `newAge` for both `age` and `optimisticAge`.

See [How optimistic state works](#how-optimistic-state-works) for a deep dive.

<Note>

When using [Action props](/reference/react/useTransition#exposing-action-props-from-components), you can call the set function without `startTransition`:

```js [[3, 2, "setOptimisticName"]]
async function submitAction() {
  setOptimisticName('Taylor')
  await updateName('Taylor')
}
```

This works because Action props are already called inside `startTransition`.

For an example, see: [Using optimistic state in Action props](#using-optimistic-state-in-action-props).

</Note>

---

### Using optimistic state in Action props {/_using-optimistic-state-in-action-props_/}

In an [Action prop](/reference/react/useTransition#exposing-action-props-from-components), you can call the optimistic setter directly without `startTransition`.

This example sets optimistic state inside a `<form>` `submitAction` prop:

<Sandpack>

```js src/App.js
import { useState, startTransition } from 'react'
import EditName from './EditName'

export default function App() {
  const [name, setName] = useState('Alice')

  return <EditName name={name} action={setName} />
}
```

```js src/EditName.js active
import { useOptimistic, startTransition } from 'react'
import { updateName } from './actions.js'

export default function EditName({ name, action }) {
  const [optimisticName, setOptimisticName] = useOptimistic(name)

  async function submitAction(formData) {
    const newName = formData.get('name')
    setOptimisticName(newName)

    const updatedName = await updateName(newName)
    startTransition(() => {
      action(updatedName)
    })
  }

  return (
    <form action={submitAction}>
      <p>Your name is: {optimisticName}</p>
      <p>
        <label>Change it: </label>
        <input type="text" name="name" disabled={name !== optimisticName} />
      </p>
    </form>
  )
}
```

```js src/actions.js hidden
export async function updateName(name) {
  await new Promise((res) => setTimeout(res, 1000))
  return name
}
```

</Sandpack>

In this example, when the user submits the form, the `optimisticName` updates immediately to show the `newName` optimistically while the server request is in progress. When the request completes, `name` and `optimisticName` are rendered with the actual `updatedName` from the response.

<DeepDive>

#### Why doesn't this need `startTransition`? {/_why-doesnt-this-need-starttransition_/}

By convention, props called inside `startTransition` are named with "Action".

Since `submitAction` is named with "Action", you know it's already called inside `startTransition`.

See [Exposing `action` prop from components](/reference/react/useTransition#exposing-action-props-from-components) for the Action prop pattern.

</DeepDive>

---

### Adding optimistic state to Action props {/_adding-optimistic-state-to-action-props_/}

When creating an [Action prop](/reference/react/useTransition#exposing-action-props-from-components), you can add `useOptimistic` to show immediate feedback.

Here's a button that shows "Submitting..." while the `action` is pending:

<Sandpack>

```js src/App.js
import { useState, startTransition } from 'react'
import Button from './Button'
import { submitForm } from './actions.js'

export default function App() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <Button
        action={async () => {
          await submitForm()
          startTransition(() => {
            setCount((c) => c + 1)
          })
        }}
      >
        Increment
      </Button>
      {count > 0 && <p>Submitted {count}!</p>}
    </div>
  )
}
```

```js src/Button.js active
import { useOptimistic, startTransition } from 'react'

export default function Button({ action, children }) {
  const [isPending, setIsPending] = useOptimistic(false)

  return (
    <button
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          setIsPending(true)
          await action()
        })
      }}
    >
      {isPending ? 'Submitting...' : children}
    </button>
  )
}
```

```js src/actions.js hidden
export async function submitForm() {
  await new Promise((res) => setTimeout(res, 1000))
}
```

</Sandpack>

When the button is clicked, `setIsPending(true)` uses optimistic state to immediately show "Submitting..." and disable the button. When the Action is done, `isPending` is rendered as `false` automatically.

This pattern automatically shows a pending state however `action` prop is used with `Button`:

```js
// Show pending state for a state update
<Button action={() => { setState(c => c + 1) }} />

// Show pending state for a navigation
<Button action={() => { navigate('/done') }} />

// Show pending state for a POST
<Button action={async () => { await fetch(/* ... */) }} />

// Show pending state for any combination
<Button action={async () => {
  setState(c => c + 1);
  await fetch(/* ... */);
  navigate('/done');
}} />
```

The pending state will be shown until everything in the `action` prop is finished.

<Note>

You can also use [`useTransition`](/reference/react/useTransition) to get pending state via `isPending`.

The difference is that `useTransition` gives you the `startTransition` function, while `useOptimistic` works with any Transition. Use whichever fits your component's needs.

</Note>

---

### Updating props or state optimistically {/_updating-props-or-state-optimistically_/}

You can wrap props or state in `useOptimistic` to update it immediately while an Action is in progress.

In this example, `LikeButton` receives `isLiked` as a prop and immediately toggles it when clicked:

<Sandpack>

```js src/App.js
import { useState, useOptimistic, startTransition } from 'react'
import { toggleLike } from './actions.js'

export default function App() {
  const [isLiked, setIsLiked] = useState(false)
  const [optimisticIsLiked, setOptimisticIsLiked] = useOptimistic(isLiked)

  function handleClick() {
    startTransition(async () => {
      const newValue = !optimisticIsLiked
      console.log('⏳ setting optimistic state: ' + newValue)

      setOptimisticIsLiked(newValue)
      const updatedValue = await toggleLike(newValue)

      startTransition(() => {
        console.log('⏳ setting real state: ' + updatedValue)
        setIsLiked(updatedValue)
      })
    })
  }

  if (optimisticIsLiked !== isLiked) {
    console.log('✅ rendering optimistic state: ' + optimisticIsLiked)
  } else {
    console.log('✅ rendering real value: ' + optimisticIsLiked)
  }

  return (
    <button onClick={handleClick}>
      {optimisticIsLiked ? '❤️ Unlike' : '🤍 Like'}
    </button>
  )
}
```

```js src/actions.js hidden
export async function toggleLike(value) {
  return await new Promise((res) => setTimeout(() => res(value), 1000))
  // In a real app, this would update the server
}
```

```js src/index.js hidden
import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

import App from './App'

const root = createRoot(document.getElementById('root'))
// Not using StrictMode so double render logs are not shown.
root.render(<App />)
```

</Sandpack>

When the button is clicked, `setOptimisticIsLiked` immediately updates the displayed state to show the heart as liked. Meanwhile, `await toggleLike` runs in the background. When the `await` completes, `setIsLiked` parent updates the "real" `isLiked` state, and the optimistic state is rendered to match this new value.

<Note>

This example reads from `optimisticIsLiked` to calculate the next value. This works when the base state won't change, but if the base state might change while your Action is pending, you may want to use a state updater or the reducer.

See [Updating state based on the current state](#updating-state-based-on-current-state) for an example.

</Note>

---

### Updating multiple values together {/_updating-multiple-values-together_/}

When an optimistic update affects multiple related values, use a reducer to update them together. This ensures the UI stays consistent.

Here's a follow button that updates both the follow state and follower count:

<Sandpack>

```js src/App.js
import { useState, startTransition } from 'react'
import { followUser, unfollowUser } from './actions.js'
import FollowButton from './FollowButton'

export default function App() {
  const [user, setUser] = useState({
    name: 'React',
    isFollowing: false,
    followerCount: 10500,
  })

  async function followAction(shouldFollow) {
    if (shouldFollow) {
      await followUser(user.name)
    } else {
      await unfollowUser(user.name)
    }
    startTransition(() => {
      setUser((current) => ({
        ...current,
        isFollowing: shouldFollow,
        followerCount: current.followerCount + (shouldFollow ? 1 : -1),
      }))
    })
  }

  return <FollowButton user={user} followAction={followAction} />
}
```

```js src/FollowButton.js active
import { useOptimistic, startTransition } from 'react'

export default function FollowButton({ user, followAction }) {
  const [optimisticState, updateOptimistic] = useOptimistic(
    { isFollowing: user.isFollowing, followerCount: user.followerCount },
    (current, isFollowing) => ({
      isFollowing,
      followerCount: current.followerCount + (isFollowing ? 1 : -1),
    })
  )

  function handleClick() {
    const newFollowState = !optimisticState.isFollowing
    startTransition(async () => {
      updateOptimistic(newFollowState)
      await followAction(newFollowState)
    })
  }

  return (
    <div>
      <p>
        <strong>{user.name}</strong>
      </p>
      <p>{optimisticState.followerCount} followers</p>
      <button onClick={handleClick}>
        {optimisticState.isFollowing ? 'Unfollow' : 'Follow'}
      </button>
    </div>
  )
}
```

```js src/actions.js hidden
export async function followUser(name) {
  await new Promise((res) => setTimeout(res, 1000))
}

export async function unfollowUser(name) {
  await new Promise((res) => setTimeout(res, 1000))
}
```

</Sandpack>

The reducer receives the new `isFollowing` value and calculates both the new follow state and the updated follower count in a single update. This ensures the button text and count always stay in sync.

<DeepDive>

#### Choosing between updaters and reducers {/_choosing-between-updaters-and-reducers_/}

`useOptimistic` supports two patterns for calculating state based on current state:

**Updater functions** work like [useState updaters](/reference/react/useState#updating-state-based-on-the-previous-state). Pass a function to the setter:

```js
const [optimistic, setOptimistic] = useOptimistic(value)
setOptimistic((current) => !current)
```

**Reducers** separate the update logic from the setter call:

```js
const [optimistic, dispatch] = useOptimistic(value, (current, action) => {
  // Calculate next state based on current and action
})
dispatch(action)
```

**Use updaters** for calculations where the setter call naturally describes the update. This is similar to using `setState(prev => ...)` with `useState`.

**Use reducers** when you need to pass data to the update (like which item to add) or when handling multiple types of updates with a single hook.

**Why use a reducer?**

Reducers are essential when the base state might change while your Transition is pending. If `todos` changes while your add is pending (for example, another user added a todo), React will re-run your reducer with the new `todos` to recalculate what to show. This ensures your new todo is added to the latest list, not an outdated copy.

An updater function like `setOptimistic(prev => [...prev, newItem])` would only see the state from when the Transition started, missing any updates that happened during the async work.

</DeepDive>

---

### Optimistically adding to a list {/_optimistically-adding-to-a-list_/}

When you need to optimistically add items to a list, use a `reducer`:

<Sandpack>

```js src/App.js
import { useState, startTransition } from 'react'
import { addTodo } from './actions.js'
import TodoList from './TodoList'

export default function App() {
  const [todos, setTodos] = useState([{ id: 1, text: 'Learn React' }])

  async function addTodoAction(newTodo) {
    const savedTodo = await addTodo(newTodo)
    startTransition(() => {
      setTodos((todos) => [...todos, savedTodo])
    })
  }

  return <TodoList todos={todos} addTodoAction={addTodoAction} />
}
```

```js src/TodoList.js active
import { useOptimistic, startTransition } from 'react'

export default function TodoList({ todos, addTodoAction }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (currentTodos, newTodo) => [
      ...currentTodos,
      { id: newTodo.id, text: newTodo.text, pending: true },
    ]
  )

  function handleAddTodo(text) {
    const newTodo = { id: crypto.randomUUID(), text: text }
    startTransition(async () => {
      addOptimisticTodo(newTodo)
      await addTodoAction(newTodo)
    })
  }

  return (
    <div>
      <button onClick={() => handleAddTodo('New todo')}>Add Todo</button>
      <ul>
        {optimisticTodos.map((todo) => (
          <li key={todo.id}>
            {todo.text} {todo.pending && '(Adding...)'}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

```js src/actions.js hidden
export async function addTodo(todo) {
  await new Promise((res) => setTimeout(res, 1000))
  // In a real app, this would save to the server
  return { ...todo, pending: false }
}
```

</Sandpack>

The `reducer` receives the current list of todos and the new todo to add. This is important because if the `todos` prop changes while your add is pending (for example, another user added a todo), React will update your optimistic state by re-running the reducer with the updated list. This ensures your new todo is added to the latest list, not an outdated copy.

<Note>

Each optimistic item includes a `pending: true` flag so you can show loading state for individual items. When the server responds and the parent updates the canonical `todos` list with the saved item, the optimistic state updates to the confirmed item without the pending flag.

</Note>

---

### Handling multiple `action` types {/_handling-multiple-action-types_/}

When you need to handle multiple types of optimistic updates (like adding and removing items), use a reducer pattern with `action` objects.

This shopping cart example shows how to handle add and remove with a single reducer:

<Sandpack>

```js src/App.js
import { useState, startTransition } from 'react'
import { addToCart, removeFromCart, updateQuantity } from './actions.js'
import ShoppingCart from './ShoppingCart'

export default function App() {
  const [cart, setCart] = useState([])

  const cartActions = {
    async add(item) {
      await addToCart(item)
      startTransition(() => {
        setCart((current) => {
          const exists = current.find((i) => i.id === item.id)
          if (exists) {
            return current.map((i) =>
              i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
            )
          }
          return [...current, { ...item, quantity: 1 }]
        })
      })
    },
    async remove(id) {
      await removeFromCart(id)
      startTransition(() => {
        setCart((current) => current.filter((item) => item.id !== id))
      })
    },
    async updateQuantity(id, quantity) {
      await updateQuantity(id, quantity)
      startTransition(() => {
        setCart((current) =>
          current.map((item) => (item.id === id ? { ...item, quantity } : item))
        )
      })
    },
  }

  return <ShoppingCart cart={cart} cartActions={cartActions} />
}
```

```js src/ShoppingCart.js active
import { useOptimistic, startTransition } from 'react'

export default function ShoppingCart({ cart, cartActions }) {
  const [optimisticCart, dispatch] = useOptimistic(
    cart,
    (currentCart, action) => {
      switch (action.type) {
        case 'add':
          const exists = currentCart.find((item) => item.id === action.item.id)
          if (exists) {
            return currentCart.map((item) =>
              item.id === action.item.id
                ? { ...item, quantity: item.quantity + 1, pending: true }
                : item
            )
          }
          return [
            ...currentCart,
            { ...action.item, quantity: 1, pending: true },
          ]
        case 'remove':
          return currentCart.filter((item) => item.id !== action.id)
        case 'update_quantity':
          return currentCart.map((item) =>
            item.id === action.id
              ? { ...item, quantity: action.quantity, pending: true }
              : item
          )
        default:
          return currentCart
      }
    }
  )

  function handleAdd(item) {
    startTransition(async () => {
      dispatch({ type: 'add', item })
      await cartActions.add(item)
    })
  }

  function handleRemove(id) {
    startTransition(async () => {
      dispatch({ type: 'remove', id })
      await cartActions.remove(id)
    })
  }

  function handleUpdateQuantity(id, quantity) {
    startTransition(async () => {
      dispatch({ type: 'update_quantity', id, quantity })
      await cartActions.updateQuantity(id, quantity)
    })
  }

  const total = optimisticCart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  return (
    <div>
      <h2>Shopping Cart</h2>
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() =>
            handleAdd({
              id: 1,
              name: 'T-Shirt',
              price: 25,
            })
          }
        >
          Add T-Shirt ($25)
        </button>{' '}
        <button
          onClick={() =>
            handleAdd({
              id: 2,
              name: 'Mug',
              price: 15,
            })
          }
        >
          Add Mug ($15)
        </button>
      </div>
      {optimisticCart.length === 0 ? (
        <p>Your cart is empty</p>
      ) : (
        <ul>
          {optimisticCart.map((item) => (
            <li key={item.id}>
              {item.name} - ${item.price} ×{item.quantity} = $
              {item.price * item.quantity}
              <button
                onClick={() => handleRemove(item.id)}
                style={{ marginLeft: 8 }}
              >
                Remove
              </button>
              {item.pending && ' ...'}
            </li>
          ))}
        </ul>
      )}
      <p>
        <strong>Total: ${total}</strong>
      </p>
    </div>
  )
}
```

```js src/actions.js hidden
export async function addToCart(item) {
  await new Promise((res) => setTimeout(res, 800))
}

export async function removeFromCart(id) {
  await new Promise((res) => setTimeout(res, 800))
}

export async function updateQuantity(id, quantity) {
  await new Promise((res) => setTimeout(res, 800))
}
```

</Sandpack>

The reducer handles three `action` types (`add`, `remove`, `update_quantity`) and returns the new optimistic state for each. Each `action` sets a `pending: true` flag so you can show visual feedback while the [Server Function](/reference/rsc/server-functions) runs.

---

### Optimistic delete with error recovery {/_optimistic-delete-with-error-recovery_/}

When deleting items optimistically, you should handle the case where the Action fails.

This example shows how to display an error message when a delete fails, and the UI automatically rolls back to show the item again.

<Sandpack>

```js src/App.js
import { useState, startTransition } from 'react'
import { deleteItem } from './actions.js'
import ItemList from './ItemList'

export default function App() {
  const [items, setItems] = useState([
    { id: 1, name: 'Learn React' },
    { id: 2, name: 'Build an app' },
    { id: 3, name: 'Deploy to production' },
  ])

  async function deleteAction(id) {
    await deleteItem(id)
    startTransition(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    })
  }

  return <ItemList items={items} deleteAction={deleteAction} />
}
```

```js src/ItemList.js active
import { useState, useOptimistic, startTransition } from 'react'

export default function ItemList({ items, deleteAction }) {
  const [error, setError] = useState(null)
  const [optimisticItems, removeItem] = useOptimistic(
    items,
    (currentItems, idToRemove) =>
      currentItems.map((item) =>
        item.id === idToRemove ? { ...item, deleting: true } : item
      )
  )

  function handleDelete(id) {
    setError(null)
    startTransition(async () => {
      removeItem(id)
      try {
        await deleteAction(id)
      } catch (e) {
        setError(e.message)
      }
    })
  }

  return (
    <div>
      <h2>Your Items</h2>
      <ul>
        {optimisticItems.map((item) => (
          <li
            key={item.id}
            style={{
              opacity: item.deleting ? 0.5 : 1,
              textDecoration: item.deleting ? 'line-through' : 'none',
              transition: 'opacity 0.2s',
            }}
          >
            {item.name}
            <button
              onClick={() => handleDelete(item.id)}
              disabled={item.deleting}
              style={{ marginLeft: 8 }}
            >
              {item.deleting ? 'Deleting...' : 'Delete'}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p style={{ color: 'red', padding: 8, background: '#fee' }}>{error}</p>
      )}
    </div>
  )
}
```

```js src/actions.js hidden
export async function deleteItem(id) {
  await new Promise((res) => setTimeout(res, 1000))
  // Item 3 always fails to demonstrate error recovery
  if (id === 3) {
    throw new Error('Cannot delete. Permission denied.')
  }
}
```

</Sandpack>

Try deleting 'Deploy to production'. When the delete fails, the item automatically reappears in the list.

---

## Troubleshooting {/_troubleshooting_/}

### I'm getting an error: "An optimistic state update occurred outside a Transition or Action" {/_an-optimistic-state-update-occurred-outside-a-transition-or-action_/}

You may see this error:

<ConsoleBlockMulti>

<ConsoleLogLine level="error">

An optimistic state update occurred outside a Transition or Action. To fix, move the update to an Action, or wrap with `startTransition`.

</ConsoleLogLine>

</ConsoleBlockMulti>

The optimistic setter function must be called inside `startTransition`:

```js
// 🚩 Incorrect: outside a Transition
function handleClick() {
  setOptimistic(newValue) // Warning!
  // ...
}

// ✅ Correct: inside a Transition
function handleClick() {
  startTransition(async () => {
    setOptimistic(newValue)
    // ...
  })
}

// ✅ Also correct: inside an Action prop
function submitAction(formData) {
  setOptimistic(newValue)
  // ...
}
```

When you call the setter outside an Action, the optimistic state will briefly appear and then immediately revert back to the original value. This happens because there's no Transition to "hold" the optimistic state while your Action runs.

### I'm getting an error: "Cannot update optimistic state while rendering" {/_cannot-update-optimistic-state-while-rendering_/}

You may see this error:

<ConsoleBlockMulti>

<ConsoleLogLine level="error">

Cannot update optimistic state while rendering.

</ConsoleLogLine>

</ConsoleBlockMulti>

This error occurs when you call the optimistic setter during the render phase of a component. You can only call it from event handlers, effects, or other callbacks:

```js
// 🚩 Incorrect: calling during render
function MyComponent({ items }) {
  const [isPending, setPending] = useOptimistic(false)

  // This runs during render - not allowed!
  setPending(true)

  // ...
}

// ✅ Correct: calling inside startTransition
function MyComponent({ items }) {
  const [isPending, setPending] = useOptimistic(false)

  function handleClick() {
    startTransition(() => {
      setPending(true)
      // ...
    })
  }

  // ...
}

// ✅ Also correct: calling from an Action
function MyComponent({ items }) {
  const [isPending, setPending] = useOptimistic(false)

  function action() {
    setPending(true)
    // ...
  }

  // ...
}
```

### My optimistic updates show stale values {/_my-optimistic-updates-show-stale-values_/}

If your optimistic state seems to be based on old data, consider using an updater function or reducer to calculate the optimistic state relative to the current state.

```js
// May show stale data if state changes during Action
const [optimistic, setOptimistic] = useOptimistic(count)
setOptimistic(5) // Always sets to 5, even if count changed

// Better: relative updates handle state changes correctly
const [optimistic, adjust] = useOptimistic(
  count,
  (current, delta) => current + delta
)
adjust(1) // Always adds 1 to whatever the current count is
```

See [Updating state based on the current state](#updating-state-based-on-current-state) for details.

### I don't know if my optimistic update is pending {/_i-dont-know-if-my-optimistic-update-is-pending_/}

To know when `useOptimistic` is pending, you have three options:

1. **Check if `optimisticValue === value`**

```js
const [optimistic, setOptimistic] = useOptimistic(value)
const isPending = optimistic !== value
```

If the values are not equal, there's a Transition in progress.

2. **Add a `useTransition`**

```js
const [isPending, startTransition] = useTransition()
const [optimistic, setOptimistic] = useOptimistic(value)

//...
startTransition(() => {
  setOptimistic(state)
})
```

Since `useTransition` uses `useOptimistic` for `isPending` under the hood, this is equivalent to option 1.

3. **Add a `pending` flag in your reducer**

```js
const [optimistic, addOptimistic] = useOptimistic(items, (state, newItem) => [
  ...state,
  { ...newItem, isPending: true },
])
```

Since each optimistic item has its own flag, you can show loading state for individual items.
