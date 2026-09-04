// Responds with a redirect (302) to a static image on the same origin using a
// relative `Location` header.
export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response(null, {
    status: 302,
    headers: { Location: '/test.png' },
  })
}
