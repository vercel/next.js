import { Suspense } from 'react'
import { getRecommendations } from '../../lib/recommendations'

// The picks ride in the link prefetch, so this route uses Partial
// Prefetching (set up in the same perf sprint as the caching change).
export const prefetch = 'partial'

async function RecommendationsList() {
  const recs = await getRecommendations()
  return (
    <ul id="recs" data-computed-at={String(recs.computedAt)}>
      {recs.picks.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  )
}

export default function RecommendationsPage() {
  return (
    <main>
      <h1>Your picks</h1>
      <Suspense fallback={<p id="recs-loading">Loading recommendations…</p>}>
        <RecommendationsList />
      </Suspense>
    </main>
  )
}
