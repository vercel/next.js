import { state } from '../../../lib/state'

export const dynamic = 'force-static'

export function GET() {
  return Response.json(state('route-dynamic-sibling'))
}
