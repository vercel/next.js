import { Suspense } from 'react'
import { DirectLanguage } from '../cached'

async function CachedUI() {
  'use cache'
  return (
    <>
      <p id="cache-prefix">This belongs to the cached result</p>
      <Suspense fallback={<p id="inner-pending">Loading inside cache</p>}>
        <DirectLanguage />
      </Suspense>
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p id="outer-pending">Loading entire cache</p>}>
      <CachedUI />
    </Suspense>
  )
}
