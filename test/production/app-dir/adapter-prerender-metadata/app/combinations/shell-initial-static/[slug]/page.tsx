import { Suspense } from 'react'
import { ClientHole } from '../../client-hole'

export default function Page() {
  return (
    <Suspense fallback={<p>loading query</p>}>
      <ClientHole />
    </Suspense>
  )
}
