import { connection } from 'next/server'
import { redirect } from 'next/navigation'

// A redirect after a request-time read, with no `<Suspense>` of its own.
// The page itself cannot prerender, so this is a blocking route that opts
// out of instant validation.
export const instant = false

export default function Page() {
  return (
    <main>
      <h1>shell</h1>
      <Redirecting />
    </main>
  )
}

async function Redirecting() {
  await connection()
  redirect('/redirect/target')
  return <></>
}
