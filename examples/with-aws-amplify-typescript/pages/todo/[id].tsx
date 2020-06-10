import * as React from 'react'
import { API, graphqlOperation } from 'aws-amplify'

import { GetTodoQuery } from '../../src/API'
import { getTodo } from '../../src/graphql/queries'
import config from '../../src/aws-exports'

API.configure(config)

const TodoPage = (props: { todo: GetTodoQuery['getTodo'] }) => {
  return (
    <div>
      <h2>Individual Todo {props.todo.id}</h2>
      <pre>{JSON.stringify(props.todo, null, 2)}</pre>
    </div>
  )
}

export const getServerSideProps = async (context) => {
  const { id } = context.query
  const todo = (await API.graphql({
    ...graphqlOperation(getTodo),
    variables: { id },
  })) as { data: GetTodoQuery; errors: any[] }

  if (todo.errors) {
    console.error(todo.errors)
    throw new Error(todo.errors[0].message)
  }

  return {
    props: {
      todo: todo.data.getTodo,
    },
  }
}

export default TodoPage
