import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getRecommendations, getTrack } from '@/lib/tracks'

export default function TrackPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <Suspense fallback={<p>Loading track…</p>}>
        <TrackDetails params={params} />
      </Suspense>
      <Suspense fallback={<p>Loading recommendations…</p>}>
        <Recommendations params={params} />
      </Suspense>
    </main>
  )
}

async function TrackDetails({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const track = await getTrack(slug)
  if (!track) notFound()

  return (
    <header>
      <h1>{track.title}</h1>
      <p>{track.artist}</p>
    </header>
  )
}

async function Recommendations({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const recommendations = await getRecommendations(slug)

  return (
    <section data-testid="recommendations">
      <h2>Recommended next</h2>
      {recommendations.map((track) => (
        <p key={track.slug}>{track.title}</p>
      ))}
    </section>
  )
}
