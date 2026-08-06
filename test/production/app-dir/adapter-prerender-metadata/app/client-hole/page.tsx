import { Suspense } from 'react'
import { ClientHole } from './client'

export default function Page() {
  return (
    <div>
      <p>static part</p>
      <Suspense fallback={<p>loading...</p>}>
        <ClientHole />
      </Suspense>
    </div>
  )
}
