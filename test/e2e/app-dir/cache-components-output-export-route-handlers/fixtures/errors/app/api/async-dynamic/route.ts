import { connection } from 'next/server'

await Promise.resolve()

export async function GET() {
  await connection()
  return Response.json({ message: 'Async dynamic GET' })
}
