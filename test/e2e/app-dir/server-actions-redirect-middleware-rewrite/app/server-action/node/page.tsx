'use client'

import { redirectAction } from '../_action'

export default function Page() {
  return (
    <form action={redirectAction}>
      <button type="submit">Submit</button>
    </form>
  )
}

export const runtime = 'nodejs'
