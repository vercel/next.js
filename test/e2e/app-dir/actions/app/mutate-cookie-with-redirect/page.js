import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

async function updateCookieAndRedirect() {
  'use server'
  ;(await cookies()).set('testCookie', Date.now())
  redirect('/mutate-cookie-with-redirect/redirect-target')
}

export default async function Page() {
  return (
    <>
      <p id="value">{(await cookies()).get('testCookie')?.value ?? '<null>'}</p>
      <form action={updateCookieAndRedirect}>
        <button id="update-cookie" type="submit">
          Update Cookie
        </button>
      </form>
    </>
  )
}
