import { notFound, permanentRedirect } from 'next/navigation'
import { getState } from '../../state'

export function generateStaticParams() {
  return [{ slug: 'built' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const state = await getState(slug)
  if (state === 'not-found') {
    notFound()
  }
  if (state.startsWith('/')) {
    permanentRedirect(state)
  }
  return <p id="content">{slug}</p>
}
