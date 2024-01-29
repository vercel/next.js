import { cookies } from 'next/headers'
import Link from 'next/link'

async function updateCookie() {
  'use server'
  cookies().set('test-cookie2', Date.now())
}

export default function Page() {
  return (
    <>
      <Link id="page-2" href="/mutate-cookie/page-2">
        to page2
      </Link>
      <p id="value">{cookies().get('test-cookie2')?.value}</p>
      <form action={updateCookie}>
        <button id="update-cookie" type="submit">
          Update Cookie
        </button>
      </form>
    </>
  )
}
