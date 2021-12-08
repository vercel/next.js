import { Amplify, API, withSSRContext } from 'aws-amplify'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { DeleteTodoInput, GetTodoQuery, Todo, ListTodosQuery } from '../../API'
import awsExports from '../../aws-exports'
import { deleteTodo } from '../../graphql/mutations'
import { getTodo, listTodos } from '../../graphql/queries'
import { GetStaticProps, GetStaticPaths } from 'next'
import { GRAPHQL_AUTH_MODE } from '@aws-amplify/api'
import styles from '../../styles/Home.module.css'

Amplify.configure({ ...awsExports, ssr: true })

export default function TodoPage({ todo }: { todo: Todo }) {
  const router = useRouter()

  if (router.isFallback) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Loading&hellip;</h1>
      </div>
    )
  }

  async function handleDelete(): Promise<void> {
    try {
      const deleteInput: DeleteTodoInput = {
        id: todo.id,
      }

      await API.graphql({
        authMode: GRAPHQL_AUTH_MODE.AMAZON_COGNITO_USER_POOLS,
        query: deleteTodo,
        variables: {
          input: deleteInput,
        },
      })

      router.push(`/`)
    } catch ({ errors }) {
      console.error(...errors)
      throw new Error(errors[0].message)
    }
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>{todo.name} – Amplify + Next.js</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>{todo.name}</h1>
        <p className={styles.description}>{todo.description}</p>
      </main>

      <footer>
        <button className={styles.footer} onClick={handleDelete}>
          💥 Delete todo
        </button>
      </footer>
    </div>
  )
}

export const getStaticPaths: GetStaticPaths = async () => {
  const SSR = withSSRContext()

  const todosQuery = (await SSR.API.graphql({
    query: listTodos,
    authMode: GRAPHQL_AUTH_MODE.API_KEY,
  })) as { data: ListTodosQuery; errors: any[] }

  const paths = todosQuery.data.listTodos.items.map((todo: Todo) => ({
    params: { id: todo.id },
  }))

  return {
    fallback: true,
    paths,
  }
}

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const SSR = withSSRContext()

  const response = (await SSR.API.graphql({
    query: getTodo,
    variables: {
      id: params.id,
    },
  })) as { data: GetTodoQuery }

  return {
    props: {
      todo: response.data.getTodo,
    },
  }
}
