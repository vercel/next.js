import { connection } from 'next/server'
import { getCachedValue } from '../../../lib/cached-value'
import { readValue } from '../../../lib/state'

export async function GET() {
  await connection()
  return Response.json({ source: readValue(), cached: await getCachedValue() })
}
