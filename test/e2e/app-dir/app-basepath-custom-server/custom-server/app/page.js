import { redirect } from 'next/navigation'

async function action() {
  'use server'

  redirect('/another')
}

export default function Page() {
  return (
    <form action={action}>
      <input type="submit" value="Submit" id="submit-server-action-redirect" />
    </form>
  )
}
