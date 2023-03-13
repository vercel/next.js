import B from 'node:buffer'

/**
 * @param {Request} req
 */
export async function POST(req) {
  const text = await req.text()
  const buf = B.Buffer.from(text)
  return new Response(
    JSON.stringify({
      encoded: buf.toString('base64'),
      exposedKeys: Object.keys(B),
    })
  )
}

export const runtime = 'edge'
