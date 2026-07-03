import { Suspense } from 'react'
import SearchClient from './search-client'

// `useSearchParams()` is client-only data: the static shell exports and the
// client fills it after hydration. There's no server involved, so this is a
// valid static export even though the boundary "postpones".
export default function Page() {
  return (
    <main>
      <p id="static">static shell</p>
      <Suspense fallback={<p id="fallback">loading…</p>}>
        <SearchClient />
      </Suspense>
    </main>
  )
}
