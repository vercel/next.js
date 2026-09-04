// Responds with a redirect (302) to an absolute URL on a different origin,
// which is allowed by `images.remotePatterns` in `next.config.js`.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { port } = new URL(req.url)
  return new Response(null, {
    status: 302,
    headers: { Location: `http://127.0.0.1:${port}/test.png` },
  })
}
