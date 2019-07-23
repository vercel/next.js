import * as React from 'react'
import { API, graphqlOperation } from 'aws-amplify'
import nanoid from 'nanoid'
import produce from 'immer'
import sortBy from 'array-sort'

import config from '../src/aws-exports'
import { createTodo, deleteTodo } from '../src/graphql/mutations'
import { listTodos } from '../src/graphql/queries'

API.configure(config)

const reducer = (state, action) => {
  switch (action.type) {
    case 'set-current': {
      return produce(state, draft => {
        draft.currentName = action.payload
      })
    }
    case 'reset-current': {
      return produce(state, draft => {
        draft.currentName = ''
      })
    }
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
  }
}

const createToDo = async (dispatch, name) => {
  const todo = {
    id: nanoid(),
    name: name,
    createdAt: `${Date.now()}`,
    completed: false,
  }
  dispatch({ type: 'add-todo', payload: todo })
  try {
    await API.graphql({
      ...graphqlOperation(createTodo),
      variables: { input: todo },
    })
    dispatch({ type: 'reset-current' })
  } catch (err) {
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
  // In cases where a big amount of data is retrieved you would need to do sorting on the server using the @key directive in your GraphQL schema
  const sortedTodos = sortBy(state.todos.filter(todo => todo), ['createdAt'])
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
      {sortedTodos.map((todo, index) => (
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
App.getInitialProps = async context => {
  const result = await API.graphql({
    ...graphqlOperation(listTodos),
  })

  return {
    todos: result.data.listTodos.items,
  }
}

export default App
