'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@vercel/postgres'
import { z } from 'zod'

// CREATE TABLE todos (
//   id SERIAL PRIMARY KEY,
//   text TEXT NOT NULL
// );

export async function createTodo(formData: FormData) {
  const schema = z.object({
    todo: z.string().nonempty(),
  })
  const data = schema.parse({
    todo: formData.get('todo'),
  })

  try {
    await sql`
    INSERT INTO todos (text)
    VALUES (${data.todo})
  `

    revalidatePath('/')

    return { message: 'Saved successfully' }
  } catch (e) {
    return { message: 'Failed to create todo' }
  }
}

export async function deleteTodo(formData: FormData) {
  const schema = z.object({
    id: z.string().nonempty(),
  })
  const data = schema.parse({
    id: formData.get('id'),
  })

  await sql`
    DELETE FROM todos
    WHERE id = ${data.id};
  `

  revalidatePath('/')
}
