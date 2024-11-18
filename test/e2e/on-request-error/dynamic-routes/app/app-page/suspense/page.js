import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  if (typeof window === 'undefined') {
    throw new Error('server-suspense-page-node-error')
  }
  return 'inner'
}

export const dynamic = 'force-dynamic'
