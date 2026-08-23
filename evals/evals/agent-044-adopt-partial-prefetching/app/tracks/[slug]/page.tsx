import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getRecommendations, getTrack } from '@/lib/tracks'

export default async function TrackPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <main>
      <Suspense fallback={<p>Loading track…</p>}>
        <TrackDetails slug={slug} />
      </Suspense>
      <Suspense fallback={<p>Loading recommendations…</p>}>
        <Recommendations slug={slug} />
      </Suspense>
    </main>
  )
}

async function TrackDetails({ slug }: { slug: string }) {
  const track = await getTrack(slug)
  if (!track) notFound()

  return (
    <header>
      <h1>{track.title}</h1>
      <p>{track.artist}</p>
    </header>
  )
}

async function Recommendations({ slug }: { slug: string }) {
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
