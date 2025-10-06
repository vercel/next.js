import { after } from 'next/server'
import { cookies } from 'next/headers'

export default async function Index() {
  const cookieStore = await cookies()
  after(async () => {
    cookieStore.set('testCookie', 'after-render', { path: '/' })
  })

  const action = async () => {
    'use server'
    const cookieStore = await cookies()
    cookieStore.set('testCookie', 'action', { path: '/' })

    after(async () => {
      cookieStore.set('testCookie', 'after-action', { path: '/' })
    })
  }

  return (
    <div>
      <h1>Page with after() that tries to set cookies</h1>
      <div id="cookie">
        Cookie: {JSON.stringify(cookieStore.get('testCookie')?.value ?? null)}
      </div>
      <form action={action}>
        <button type="submit">Submit</button>
      </form>
    </div>
  )
}
