import { unstable_after as after } from 'next/server'
import { cookies } from 'next/headers'

export default async function Index() {
  after(async () => {
    ;(await cookies()).set('testCookie', 'after-render', { path: '/' })
  })

  const action = async () => {
    'use server'
    ;(await cookies()).set('testCookie', 'action', { path: '/' })

    after(async () => {
      ;(await cookies()).set('testCookie', 'after-action', { path: '/' })
    })
  }

  return (
    <div>
      <h1>Page with after() that tries to set cookies</h1>
      <div id="cookie">
        Cookie:{' '}
        {JSON.stringify((await cookies()).get('testCookie')?.value ?? null)}
      </div>
      <form action={action}>
        <button type="submit">Submit</button>
      </form>
    </div>
  )
}
