import { cookies } from 'next/headers'
import { setCookieAction } from './actions'

export default async function Page() {
  const c = await cookies()
  const sharedCookie = c.get('shared-cookie')?.value
  const mwOnlyCookie = c.get('mw-only-cookie')?.value

  return (
    <div>
      <p id="shared-cookie">shared-cookie: {sharedCookie}</p>
      <p id="mw-only-cookie">mw-only-cookie: {mwOnlyCookie}</p>
      <form action={setCookieAction}>
        <button type="submit" id="trigger-action">
          Set Cookie
        </button>
      </form>
    </div>
  )
}
