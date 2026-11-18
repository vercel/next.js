import { Suspense } from 'react'
import { Client } from '../../../client'

export const metadata = { title: 'Fallback article' }

export default function Page() {
  return (
    <main>
      <p id="article">Article page</p>
      <Suspense fallback="Loading article params">
        <Client />
      </Suspense>
    </main>
  )
}
