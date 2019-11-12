import * as React from 'react'
import { API, graphqlOperation } from 'aws-amplify'
import nanoid from 'nanoid'
import produce from 'immer'

import config from '../src/aws-exports'
import {
  createTodo,
  deleteTodo,
  createTodoList,
} from '../src/graphql/mutations'
import { getTodoList } from '../src/graphql/queries'

const MY_ID = nanoid()
API.configure(config)

const reducer = (state, action) => {
  switch (action.type) {
    case 'add-todo': {
      return produce(state, draft => {
        draft.todos.push(action.payload)
      })
    }
    case 'delete-todo': {
      const index = state.todos.findIndex(({ id }) => action.payload === id)
      if (index === -1) return state
      return produce(state, draft => {
        draft.todos.splice(index, 1)
      })
    }
    case 'reset-current': {
      return produce(state, draft => {
        draft.currentName = ''
      })
    }
    case 'set-current': {
      return produce(state, draft => {
        draft.currentName = action.payload
      })
    }
    default: {
      return state
    }
  }
}

const createToDo = async (dispatch, currentToDo) => {
  const todo = {
    id: nanoid(),
    name: currentToDo,
    createdAt: `${Date.now()}`,
    completed: false,
    todoTodoListId: 'global',
    userId: MY_ID,
  }
  dispatch({ type: 'add-todo', payload: todo })
  dispatch({ type: 'reset-current' })
  try {
    await API.graphql(graphqlOperation(createTodo, { input: todo }))
  } catch (err) {
    dispatch({ type: 'set-current', payload: todo.name })
    console.warn('Error adding to do ', err)
  }
}
const deleteToDo = async (dispatch, id) => {
  dispatch({ type: 'delete-todo', payload: id })
  try {
    await API.graphql({
      ...graphqlOperation(deleteTodo),
      variables: { input: { id } },
    })
  } catch (err) {
    console.warn('Error deleting to do ', err)
  }
}
const App = props => {
  const [state, dispatch] = React.useReducer(reducer, {
    todos: props.todos,
    currentName: '',
  })
  return (
    <div>
      <h3>Add a Todo</h3>
      <form
        onSubmit={ev => {
          ev.preventDefault()
          createToDo(dispatch, state.currentName)
        }}
      >
        <input
          value={state.currentName}
          onChange={e => {
            dispatch({ type: 'set-current', payload: e.target.value })
          }}
        />
        <button type="submit">Create Todo</button>
      </form>
      <h3>Todos List</h3>
      {state.todos.map((todo, index) => (
        <p key={index}>
          <a href={`/todo/${todo.id}`}>{todo.name}</a>
          <button
            onClick={() => {
              deleteToDo(dispatch, todo.id)
            }}
          >
            delete
          </button>
        </p>
      ))}
    </div>
  )
}
App.getInitialProps = async () => {
  let result = await API.graphql(
    graphqlOperation(getTodoList, { id: 'global' })
  )
  if (result.errors) {
    console.log('Failed to fetch todolist. ', result.errors)
    return { todos: [] }
  }
  if (result.data.getTodoList !== null) {
    return { todos: result.data.getTodoList.todos.items }
  }

  try {
    await API.graphql(
      graphqlOperation(createTodoList, {
        input: {
          id: 'global',
          createdAt: `${Date.now()}`,
        },
      })
    )
  } catch (err) {
    console.warn(err)
  }
  return { todos: [] }
}
export default App
