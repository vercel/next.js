import { notFound } from 'next/navigation'
import { state, State } from '../../../lib/state'

export const dynamicParams = false
export const revalidate = false

export function generateStaticParams() {
  return ['allowed', 'not-found'].map((slug) => ({ slug: [slug] }))
}

export default async function Page({ params }) {
  const resolved = await params
  if (resolved.slug[0] === 'not-found') notFound()
  return <State value={state('app-admission-closed', resolved)} />
}
