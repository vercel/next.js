import { redirect } from 'next/navigation'

export default function Page() {
  async function go() {
    'use server'
    redirect('/action/done')
  }
  return (
    <form action={go}>
      <button id="submit" type="submit">
        Submit
      </button>
    </form>
  )
}
