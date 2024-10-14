import { unstable_after as after } from 'next/server'
import { cookies } from 'next/headers'
import * as React from 'react'

export const dynamic = 'force-dynamic'

async function action() {
  'use server'
  after(async () => {
    const cookieStore = await cookies()
    cookieStore.set('illegalCookie', 'too-late-for-that')
  })
}

export default async function Page() {
  return (
    <>
      <form action={action}>
        <button type="submit">Submit</button>
      </form>
    </>
  )
}
