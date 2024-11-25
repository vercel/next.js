import * as React from 'react'
import { unstable_after as after } from 'next/server'
import { setTimeout } from 'timers/promises'

export const dynamic = 'error'

export default function Index() {
  after(async () => {
    await setTimeout(500)
    throw new Error(
      'My cool error thrown inside unstable_after on route "/page-throws-in-after/callback"'
    )
  })
  return <div>Page with after()</div>
}
