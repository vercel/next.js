import { getState } from '../../state'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(getState())
}
