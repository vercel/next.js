import { sql } from '@vercel/postgres'
import { createTodo } from '@/app/actions'
import { SubmitButton } from '@/app/submit-button'
import { DeleteForm } from '@/app/delete-form'

export const runtime = 'edge'
export const preferredRegion = 'home'

export default async function Home() {
  let data = await sql`SELECT * FROM todos`
  const { rows: todos } = data

  return (
    <div>
      <form action={createTodo}>
        <input type="text" name="todo" />
        <SubmitButton />
      </form>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            {todo.text}
            <DeleteForm id={todo.id} />
          </li>
        ))}
      </ul>
    </div>
  )
}
