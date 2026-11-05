import { connection } from 'next/server'
import { getActiveTraceId } from '../../trace-recorder'

export async function GET() {
  // Run at request time so the reported trace is the request's.
  await connection()
  return Response.json({ traceId: getActiveTraceId() })
}
