import { state } from '../../../../lib/state'
export const dynamic = 'force-static'
export const revalidate = 3600
export function generateStaticParams() {
  return ['known', 'seed-cold', 'seed-warm'].map((id) => ({ id }))
}
export async function GET(_request, { params }) {
  return Response.json(state('route-victim', await params), {
    headers: { 'x-fixture-route': 'route-victim' },
  })
}
