import { connection } from 'next/server'

// Responds with a redirect (302) to a static image on the same origin using a
// relative `Location` header.
export async function GET() {
  await connection()

  return new Response(null, {
    status: 302,
    headers: { Location: '/test.png' },
  })
}
