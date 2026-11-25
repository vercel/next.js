import { Suspense } from 'react'
import { CachedLanguage, Independent, NestedLanguage } from '../cached'

export default function Page() {
  return (
    <>
      <Suspense fallback={<p id="cached-pending">Loading cached language</p>}>
        <CachedLanguage />
      </Suspense>
      <Suspense fallback={<p id="nested-pending">Loading nested language</p>}>
        <NestedLanguage />
      </Suspense>
      <Suspense fallback={<p id="independent-pending">Loading content</p>}>
        <Independent />
      </Suspense>
    </>
  )
}
