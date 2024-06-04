import { cookies } from 'next/headers'

let mutate = false

async function updateCookie() {
  'use server'
  cookies().set('test-cookie-action', Date.now())
  mutate = true
}

export default function WithErrorPage() {
  if (mutate) {
    mutate = false
    cookies().set('test-cookie-render', Date.now())
  }

  return (
    <>
      <p id="action-value">{cookies().get('test-cookie-action')?.value}</p>
      <p id="render-value">{cookies().get('test-cookie-render')?.value}</p>
      <form action={updateCookie}>
        <button id="update-cookie" type="submit">
          Update Cookie
        </button>
      </form>
    </>
  )
}
