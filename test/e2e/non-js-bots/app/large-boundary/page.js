import { Suspense } from 'react'
import { connection } from 'next/server'
import { LargeBoundary } from '../../components/large-boundary'

async function Content() {
  await connection()
  return <LargeBoundary id="app" />
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading-shell</p>}>
      <Content />
    </Suspense>
  )
}
