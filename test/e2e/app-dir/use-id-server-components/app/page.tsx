import Link from 'next/link'
import { Suspense } from 'react'
import { DynamicMarker } from './marker'
import { Refresh } from './refresh'
import { ActionForm } from './action-form'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<span>home loading</span>}>
        <DynamicMarker name="home" />
      </Suspense>
      <Link href="/other" id="to-other">
        to other
      </Link>
      <Refresh />
      <ActionForm />
    </main>
  )
}
