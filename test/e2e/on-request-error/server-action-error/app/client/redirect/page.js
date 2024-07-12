'use client'

import { redirectAction } from '../actions'

export default function Page() {
  return (
    <div>
      <button onClick={redirectAction}>Not Found</button>
    </div>
  )
}

export const dynamic = 'force-dynamic'
