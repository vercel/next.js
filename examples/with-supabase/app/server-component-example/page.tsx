import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export default async function ServerComponent() {
  // create a Supabase client configured to use cookies
  const supabase = createServerComponentClient({ cookies })

  // this assumes you have a `todos` table
  // head over to your Supabase project's Table Editor to create a table
  // https://app.supabase.com/project/_/editor
  const { data: todos } = await supabase.from('todos').select()

  return <pre>{JSON.stringify(todos, null, 2)}</pre>
}
