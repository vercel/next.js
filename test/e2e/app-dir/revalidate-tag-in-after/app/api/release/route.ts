import { release } from '../../../lib/state'

export async function POST() {
  release()
  return Response.json({ ok: true })
}
