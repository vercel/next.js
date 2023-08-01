'use client'

// TODO: Duplicate or move this file outside the `_examples` folder to make it a route

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect, useState } from 'react'

export default function ClientComponent() {
  const [todos, setTodos] = useState<any[]>([])

  // Create a Supabase client configured to use cookies
  const supabase = createClientComponentClient()

  useEffect(() => {
    const getTodos = async () => {
      // This assumes you have a `todos` table in Supabase. Check out
      // the `Create Table and seed with data` section of the README 👇
      // https://github.com/vercel/next.js/blob/canary/examples/with-supabase/README.md
      const { data } = await supabase.from('todos').select()
      if (data) {
        setTodos(data)
      }
    }

    getTodos()
  }, [supabase, setTodos])

  return <pre>{JSON.stringify(todos, null, 2)}</pre>
}
