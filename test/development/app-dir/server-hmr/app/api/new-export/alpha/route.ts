import { alpha } from '../shared'
import { evaluatedAt } from '../unmodified'

export async function GET() {
  return Response.json({ result: alpha('x'), evaluatedAt })
}
