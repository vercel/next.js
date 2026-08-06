import { cookies } from 'next/headers'

export const runtime = 'edge'

export default function EdgeActionPage() {
  async function runAction() {
    'use server'
    const cookieStore = await cookies()
    cookieStore.set('edge-action', 'complete')
  }

  return (
    <form action={runAction}>
      <button id="run-edge-action" type="submit">
        Run Edge action
      </button>
    </form>
  )
}
