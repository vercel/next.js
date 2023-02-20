import { useRef, Fragment } from 'react'
import { proxy, useSnapshot } from 'valtio'

type Status = 'pending' | 'completed'
type Filter = Status | 'all'
type Todo = {
  description: string
  status: Status
  id: number
}

export const store = proxy<{ filter: Filter; todos: Todo[] }>({
  filter: 'all',
  todos: [],
})

const addTodo = (description: string) => {
  store.todos.push({
    description,
    status: 'pending',
    id: Date.now(),
  })
}

const removeTodo = (index: number) => {
  store.todos.splice(index, 1)
}

const toggleDone = (index: number, currentStatus: Status) => {
  const nextStatus = currentStatus === 'pending' ? 'completed' : 'pending'
  store.todos[index].status = nextStatus
}

const setFilter = (filter: Filter) => {
  store.filter = filter
}

const filterValues: Filter[] = ['all', 'pending', 'completed']

const Filters = () => {
  const snap = useSnapshot(store)
  return (
    <nav>
      {filterValues.map((filter) => (
        <Fragment key={filter}>
          <input
            name="filter"
            type="radio"
            value={filter}
            checked={snap.filter === filter}
            onChange={() => setFilter(filter)}
          />
          <label>{filter}</label>
        </Fragment>
      ))}
    </nav>
  )
}

const Todos = () => {
  const snap = useSnapshot(store)
  return (
    <ul>
      {snap.todos
        .filter(({ status }) => status === snap.filter || snap.filter === 'all')
        .map(({ description, status, id }, index) => {
          return (
            <li key={id}>
              <span
                data-status={status}
                className="description"
                onClick={() => toggleDone(index, status)}
              >
                {description}
              </span>
              <button className="remove" onClick={() => removeTodo(index)}>
                x
              </button>
            </li>
          )
        })}
    </ul>
  )
}

const CreateTodo = () => {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <section>
      <input name="description" type="text" minLength={2} ref={inputRef} />
      <button
        className="add"
        onClick={() => addTodo(inputRef.current?.value ?? '')}
      >
        Add new
      </button>
    </section>
  )
}

const App = () => (
  <main>
    <h1>
      To-do List{' '}
      <span role="img" aria-label="pen">
        ✏️
      </span>
    </h1>
    <Filters />
    <Todos />
    <CreateTodo />
  </main>
)

export default App
