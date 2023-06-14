import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export default async function ServerAction() {
  const addTodo = async () => {
    'use server'
    // create a Supabase client configured to use cookies
    const supabase = createServerActionClient({ cookies })

    // this assumes you have a `todos` table with a `title` column
    // head over to your Supabase project's Table Editor to create a table
    // https://app.supabase.com/project/_/editor
    await supabase.from('todos').insert({ title })
  }

  return (
    <form action={addTodo}>
      <input name="title" />
    </form>
  )
}
