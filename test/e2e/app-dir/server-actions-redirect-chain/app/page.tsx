import { redirect } from 'next/navigation'

async function redirectToApiRoute() {
  'use server'
  redirect('/api/redirect-chain')
}

export default function Page() {
  return (
    <form action={redirectToApiRoute}>
      <button id="redirect-chain" type="submit">
        Redirect via API
      </button>
    </form>
  )
}
