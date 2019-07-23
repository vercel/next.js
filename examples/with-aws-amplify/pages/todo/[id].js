import * as React from 'react'
import { API, graphqlOperation } from 'aws-amplify'

import { getTodo } from '../../src/graphql/queries'
import config from '../../src/aws-exports'

API.configure(config)

const TodoPage = props => {
  return (
    <div>
      <h2>Individual Todo {props.todo.id}</h2>
      <pre>{JSON.stringify(props.todo, null, 2)}</pre>
    </div>
  )
}

TodoPage.getInitialProps = async context => {
  const { id } = context.query
  try {
    const todos = await API.graphql({
      ...graphqlOperation(getTodo),
      variables: { id },
    })

    return { todo: todos.data.getTodo }
  } catch (err) {
    console.warn(err)
    return { todo: {} }
  }
}

export default TodoPage
