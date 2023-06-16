'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect, useState } from 'react'

export default function ClientComponent() {
  const [todos, setTodos] = useState<any[]>([])

  // create a Supabase client configured to use cookies
  const supabase = createClientComponentClient()

  useEffect(() => {
    const getTodos = async () => {
      // this assumes you have a `todos` table
      // head over to your Supabase project's Table Editor to create a table
      // https://app.supabase.com/project/_/editor
      const { data } = await supabase.from('todos').select()
      if (data) {
        setTodos(data)
      }
    }

    getTodos()
  }, [supabase, setTodos])

  return <pre>{JSON.stringify(todos, null, 2)}</pre>
}
