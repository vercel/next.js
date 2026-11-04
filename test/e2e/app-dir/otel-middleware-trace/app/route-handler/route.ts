import { connection } from 'next/server'
import { getRenderSpans } from '../../trace-recorder'

export async function GET() {
  // Run at request time so the reported spans belong to the request.
  await connection()
  return Response.json({ spans: getRenderSpans() })
}
