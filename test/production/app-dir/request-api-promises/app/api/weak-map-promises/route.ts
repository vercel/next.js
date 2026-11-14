import { connection } from 'next/server'

export async function GET() {
  await connection()
  return Response.json({
    count: (globalThis as { weakMapPromises?: number }).weakMapPromises,
  })
}
