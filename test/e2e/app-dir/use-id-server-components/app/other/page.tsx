import Link from 'next/link'
import { Suspense } from 'react'
import { DynamicMarker } from '../marker'

export default function Other() {
  return (
    <main>
      <Suspense fallback={<span>other loading</span>}>
        <DynamicMarker name="other" />
      </Suspense>
      <Link href="/" id="to-home">
        to home
      </Link>
    </main>
  )
}
