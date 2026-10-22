import { connection } from 'next/server'
import { getInstrumentationLifecycleSpans } from '../../trace-recorder'

export async function GET() {
  // Run at request time, in the instance serving this request.
  await connection()
  return Response.json({ spans: getInstrumentationLifecycleSpans() })
}
