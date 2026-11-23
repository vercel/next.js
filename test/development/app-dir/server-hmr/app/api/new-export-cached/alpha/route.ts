import { alpha } from '../shared'

export async function GET() {
  return Response.json({ result: await alpha('x') })
}
