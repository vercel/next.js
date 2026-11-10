import { Suspense } from 'react'
import { CachedLanguage, DirectLanguage, Independent } from './cached'

export default function Page() {
  return (
    <>
      <Suspense fallback={<p id="direct-pending">Loading language</p>}>
        <DirectLanguage />
      </Suspense>
      <Suspense fallback={<p id="cached-pending">Loading cached language</p>}>
        <CachedLanguage />
      </Suspense>
      <Suspense fallback={<p id="independent-pending">Loading content</p>}>
        <Independent />
      </Suspense>
    </>
  )
}
