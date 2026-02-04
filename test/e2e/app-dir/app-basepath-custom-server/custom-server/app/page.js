import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

async function action() {
  'use server'
  ;(await cookies()).set(
    'custom-server-action-test-cookie',
    'custom-server-action-test-cookie-val'
  )
  redirect('/another')
}

export default function Page() {
  return (
    <form action={action}>
      <input type="submit" value="Submit" id="submit-server-action-redirect" />
    </form>
  )
}
