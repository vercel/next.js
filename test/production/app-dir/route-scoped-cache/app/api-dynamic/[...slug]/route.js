import { state } from '../../../lib/state'

export const dynamic = 'force-dynamic'

export async function GET(_request, { params }) {
  return Response.json(state('route-dynamic-catchall', await params))
}
