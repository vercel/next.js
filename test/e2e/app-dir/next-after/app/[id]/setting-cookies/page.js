import { unstable_after as after } from 'next/server'
import { cookies } from 'next/headers'

export default function Index() {
  after(() => {
    cookies().set('testCookie', 'after-render')
  })
  const action = async () => {
    'use server'
    cookies().set('testCookie', 'action')

    after(() => {
      cookies().set('testCookie', 'after-action')
    })
  }

  return (
    <div>
      <h1>Page with after() that tries to set cookies</h1>
      <div id="cookie">
        Cookie: {JSON.stringify(cookies().get('testCookie')?.value ?? null)}
      </div>
      <form action={action}>
        <button type="submit">Submit</button>
      </form>
    </div>
  )
}
