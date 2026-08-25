import { Suspense } from 'react'
import { getRecommendations } from '../lib/recommendations'

async function RecommendationsList() {
  const recs = await getRecommendations()
  return (
    <ul>
      {recs.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  )
}

export default function Home() {
  return (
    <main>
      <h1>Your store</h1>
      <Suspense fallback={<p>Loading recommendations…</p>}>
        <RecommendationsList />
      </Suspense>
    </main>
  )
}
