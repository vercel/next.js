import { notFound } from 'next/navigation'
import { state, State } from '../../../../lib/state'

export const dynamicParams = false
export const revalidate = false

export function generateStaticParams() {
  return ['published', 'not-found'].map((id) => ({ id }))
}

export default async function Page({ params }) {
  const resolved = await params
  if (resolved.id === 'not-found') notFound()
  return <State value={state('app-admission-sibling', resolved)} />
}
