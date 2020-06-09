import { API, graphqlOperation } from 'aws-amplify'

import { getTodo, getTodoList } from '../../src/graphql/queries'
import config from '../../src/aws-exports'

API.configure(config)

const TodoPage = (props) => {
  return (
    <div>
      <h2>Individual Todo {props.todo.id}</h2>
      <pre>{JSON.stringify(props.todo, null, 2)}</pre>
    </div>
  )
}

export const getStaticPaths = async () => {
  let result = await API.graphql(
    graphqlOperation(getTodoList, { id: 'global' })
  )
  if (result.errors) {
    console.log('Failed to fetch todolist. ', result.errors)
    throw new Error(result.errors)
  }
  if (result.data.getTodoList !== null) {
    const paths = result.data.getTodoList.todos.items.map(({ id }) => ({
      params: { id },
    }))
    return { paths, fallback: false }
  }
}

export const getStaticProps = async ({ params: { id } }) => {
  try {
    const todo = await API.graphql({
      ...graphqlOperation(getTodo),
      variables: { id },
    })
    if (todo.errors) {
      console.log('Failed to fetch todo. ', todo.errors)
      throw new Error(todo.errors)
    }
    return {
      props: {
        todo: todo.data.getTodo,
      },
    }
  } catch (err) {
    console.log('Failed to fetch todo. ', err)
    throw new Error(err)
  }
}

export default TodoPage
