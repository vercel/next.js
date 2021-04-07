import { GraphQLClient, gql } from 'graphql-request'
import { useEffect, useRef, useState } from 'react'
import styles from '../styles/Home.module.css'

export const client = new GraphQLClient('http://localhost:8080/v1/graphql')
client.setHeader('x-hasura-admin-secret', 'myadminsecretkey')

const FetchTodosQuery = gql`
  query Todos {
    todos {
      id
      value
    }
  }
`
const AddTodoMutation = gql`
  mutation AddTodo($value: String = "") {
    insert_todos_one(object: { value: $value }) {
      id
      value
    }
  }
`

const DelTodoMutation = gql`
  mutation DelTodo($id: uuid!) {
    delete_todos_by_pk(id: $id) {
      id
      value
    }
  }
`

export default function Home() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [todos, setTodos] = useState([])
  const inputRef = useRef(null)

  const fetch = async () => {
    setLoading(true)
    try {
    } catch (error) {
      setError(true)
    }
    const data = await client.request(FetchTodosQuery)
    setTodos(data.todos)
    setLoading(false)
  }
  useEffect(() => {
    fetch()
  }, [])

  const onAdd = async (e) => {
    e.preventDefault()
    console.log(inputRef.current.value)
    await client.request(AddTodoMutation, { value: inputRef.current.value })
    inputRef.current.value = ''
    fetch()
  }
  const onDel = async (id) => {
    console.log(id)
    await client.request(DelTodoMutation, { id })
    fetch()
  }

  if (loading) return <p>Loading...</p>
  if (error) return <p>Error :(</p>

  return (
    <div className={styles.container}>
      <div className={styles.box}></div>
      <h1>TODOS</h1>
      <hr />
      {todos.map((t) => (
        <div key={t.id} className={styles.todo}>
          <div>{t.value}</div>
          <button onClick={() => onDel(t.id)}>x</button>
        </div>
      ))}
      <hr />
      <input type="text" placeholder="Enter TODO" ref={inputRef} />
      <button onClick={onAdd}>+</button>
    </div>
  )
}
