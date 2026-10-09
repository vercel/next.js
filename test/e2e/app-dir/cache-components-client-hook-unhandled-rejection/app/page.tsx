import { Suspense } from 'react'
import { SearchParams } from './search-params'

export default function Page() {
  return (
    <main>
      <p>static shell</p>
      {/* `useSearchParams()` is read inside a Suspense boundary, which is the
          documented way to keep this page prerenderable. */}
      <Suspense fallback={null}>
        <SearchParams />
      </Suspense>
    </main>
  )
}
