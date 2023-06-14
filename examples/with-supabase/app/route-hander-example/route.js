import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  // create a Supabase client configured to use cookies
  const supabase = createRouteHandlerClient({ cookies })

  // this assumes you have a `todos` table
  // head over to your Supabase project's Table Editor to create a table
  // https://app.supabase.com/project/_/editor
  const { data: todos } = await supabase.from('todos').select()

  return NextResponse.json(todos)
}
