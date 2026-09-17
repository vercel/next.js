import { connection } from 'next/server'

// Responds with a redirect (302) to an absolute URL on a different origin,
// which is allowed by `images.remotePatterns` in `next.config.js`.
export async function GET(req: Request) {
  await connection()

  const { port } = new URL(req.url)
  return new Response(null, {
    status: 302,
    headers: { Location: `http://127.0.0.1:${port}/test.png` },
  })
}
