'use client'

import { notFoundAction } from '../actions'

export default function Page() {
  return (
    <div>
      <button onClick={notFoundAction}>Not Found</button>
    </div>
  )
}

export const dynamic = 'force-dynamic'
