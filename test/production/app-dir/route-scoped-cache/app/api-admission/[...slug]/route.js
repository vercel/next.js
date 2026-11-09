import { state } from '../../../lib/state'

export const dynamic = 'force-static'
export const dynamicParams = false
export const revalidate = false

export function generateStaticParams() {
  return ['allowed', 'not-found'].map((slug) => ({ slug: [slug] }))
}

export async function GET(_request, { params }) {
  const resolved = await params
  return Response.json(state('route-admission-closed', resolved), {
    status: resolved.slug[0] === 'not-found' ? 404 : 200,
    headers: { 'x-fixture-route': 'route-admission-closed' },
  })
}
