import { Suspense } from 'react'
import Catalog from './catalog'

export default function Products() {
  return (
    <Suspense fallback={<p>Loading shop…</p>}>
      <Catalog />
    </Suspense>
  )
}
