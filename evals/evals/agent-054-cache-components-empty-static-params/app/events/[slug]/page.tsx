import { notFound } from 'next/navigation'
import { getEvent } from '../../../lib/events'

export const dynamic = 'force-static'
export const revalidate = 60

export function generateStaticParams() {
  return []
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const event = await getEvent(slug)

  if (!event) notFound()

  return (
    <main>
      <h1>{event.title}</h1>
      <p>{event.description}</p>
    </main>
  )
}
