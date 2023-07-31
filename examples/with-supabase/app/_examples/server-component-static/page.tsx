// TODO: Duplicate or move this file outside the `_examples` folder to make it a route

import { createClient } from '@supabase/supabase-js'

export default async function ServerComponent() {
  // This uses `supabase-js` directly as the request happens
  // at build-time, rather than when the user requests the page,
  // therefore, there are no cookies to pass through with the request
  // to Supabase.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // This assumes you have a `todos` table in Supabase. Check out
  // the `Create Table and seed with data` section of the README 👇
  // https://github.com/vercel/next.js/blob/canary/examples/with-supabase/README.md
  // If using RLS, you will need to ensure there is a policy to enable the `select` action.
  const { data: todos } = await supabase.from('todos').select()

  return <pre>{JSON.stringify(todos, null, 2)}</pre>
}
