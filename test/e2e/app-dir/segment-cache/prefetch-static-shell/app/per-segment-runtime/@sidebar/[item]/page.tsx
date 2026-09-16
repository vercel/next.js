import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Sidebar() {
  return (
    <aside>
      <Suspense fallback="Waiting for navigation...">
        <Content />
      </Suspense>
    </aside>
  )
}

async function Content() {
  await connection()
  return 'Navigation content'
}
