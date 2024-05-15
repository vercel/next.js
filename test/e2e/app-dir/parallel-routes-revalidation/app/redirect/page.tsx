import { redirect } from 'next/navigation'

export default function Page() {
  return (
    <form
      action={async () => {
        'use server'
        redirect('/')
      }}
    >
      <button type="submit">Redirect</button>
    </form>
  )
}
