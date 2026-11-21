import { addOne } from 'workspace-wasm'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ result: addOne(1) })
}
