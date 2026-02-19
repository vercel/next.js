import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Layout({ children }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <p>
        The layout blocks children on dynamic content, but shows a fallback, so
        it's still instant when navigating from the root
      </p>
      <DynamicInLayout />
      <hr />
      {children}
    </Suspense>
  )
}

async function DynamicInLayout() {
  await connection()
  return 'Dynamic content from layout'
}
