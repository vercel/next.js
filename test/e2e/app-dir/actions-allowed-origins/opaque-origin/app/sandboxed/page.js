import { cookies } from 'next/headers'
import { log } from '../action'

export default async function Page() {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('log-action-invoked')
  const hasLogged = cookie?.value === '1'
  return (
    <form action={log}>
      <input type="submit" />
      <output>{hasLogged ? 'Action Invoked' : 'Action Not Invoked'}</output>
    </form>
  )
}
