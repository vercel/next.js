import { n } from '../../lib/entry.js'

export async function GET() {
  const { size } = await n
  return Response.json(size)
}
