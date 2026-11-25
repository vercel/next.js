import { connection } from 'next/server'
import cacheWrites from '../../cache-writes'

export async function GET() {
  await connection()
  return Response.json(cacheWrites)
}
