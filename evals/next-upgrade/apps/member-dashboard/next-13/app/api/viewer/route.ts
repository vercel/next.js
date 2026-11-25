import { viewer } from '../../../lib/viewer'

export async function GET() {
  return Response.json(await viewer())
}
