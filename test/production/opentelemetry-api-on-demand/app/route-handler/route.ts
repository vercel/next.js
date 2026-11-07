import { connection } from 'next/server'

export async function GET() {
  // Opt out of prerendering, so that a request runs the handler.
  await connection()

  return Response.json({ hello: 'app router' })
}
