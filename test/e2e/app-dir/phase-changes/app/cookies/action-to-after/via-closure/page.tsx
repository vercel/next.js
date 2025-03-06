import { after } from 'next/server'
import { cookies } from 'next/headers'
import * as React from 'react'

export const dynamic = 'force-dynamic'

async function action() {
  'use server'
  const cookieStore = await cookies()
  after(async () => {
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
