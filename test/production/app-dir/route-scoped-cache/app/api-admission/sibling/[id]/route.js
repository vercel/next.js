import { state } from '../../../../lib/state'

export const dynamic = 'force-static'
export const dynamicParams = false
export const revalidate = false

export function generateStaticParams() {
  return ['published', 'not-found'].map((id) => ({ id }))
}

export async function GET(_request, { params }) {
  const resolved = await params
  return Response.json(state('route-admission-sibling', resolved), {
    status: resolved.id === 'not-found' ? 404 : 200,
    headers: { 'x-fixture-route': 'route-admission-sibling' },
  })
}
