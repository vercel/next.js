import { Suspense } from 'react'
import { ClientHole } from '../../client-hole'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading query</p>}>
      <ClientHole />
    </Suspense>
  )
}
