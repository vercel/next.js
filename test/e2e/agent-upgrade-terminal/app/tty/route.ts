import { connection } from 'next/server'

export async function GET() {
  // Request-time only: reports whether the dev server got the terminal as
  // its stdin.
  await connection()
  return Response.json({ stdin: Boolean(process.stdin.isTTY) })
}
