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
    console.log('Failed to fetch todos paths.', result.errors)
    throw new Error(result.errors[0].message)
  }
  const paths = result.data.getTodoList.todos.items.map(({ id }) => ({
    params: { id },
  }))
  return { paths, fallback: false }
}

export const getStaticProps = async ({ params: { id } }) => {
  const todo = await API.graphql({
    ...graphqlOperation(getTodo),
    variables: { id },
  })
  if (todo.errors) {
    console.log('Failed to fetch todo.', todo.errors)
    throw new Error(todo.errors[0].message)
  }
  return {
    props: {
      todo: todo.data.getTodo,
    },
  }
}

export default TodoPage
