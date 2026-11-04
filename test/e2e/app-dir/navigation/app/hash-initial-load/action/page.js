import { connection } from 'next/server'
import { redirect } from 'next/navigation'

export default async function Page() {
  await connection()

  return (
    <form
      action={async () => {
        'use server'
        redirect('/hash-initial-load#faq')
      }}
    >
      <button type="submit" id="redirect-with-hash">
        Redirect to /hash-initial-load#faq
      </button>
    </form>
  )
}
