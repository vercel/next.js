import { cookies } from 'next/headers'
import * as React from 'react'

export const dynamic = 'force-dynamic'

async function action() {
  'use server'
  // make sure we return an updated version of the page in the response
  ;(await cookies()).set('pleaseRenderThePage', Date.now() + '')
}

export default async function Page() {
  const timestamp = Date.now()
  const cookieStore = await cookies()
  const canSetCookies = (() => {
    try {
      cookieStore.set('illegalCookie', 'i-love-side-effects-in-render')
      return true
    } catch (err) {
      // we want assert on the error message, so don't swallow the error
      console.error(err)
      return false
    }
  })()
  return (
    <>
      <div id="timestamp">{timestamp}</div>
      <div id="canSetCookies">{JSON.stringify(canSetCookies)}</div>
      <form action={action}>
        <button type="submit">Submit</button>
      </form>
    </>
  )
}
