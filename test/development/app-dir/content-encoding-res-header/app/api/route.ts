export const dynamic = 'force-dynamic'

export async function GET() {
  // This test ensures that the `content-encoding` header is removed correctly in the downstream response.
  // vercel.com supports compression and returns a `content-encoding: br` header
  // but it's removed in patch-fetch.js to address https://github.com/nodejs/undici/issues/1462
  const res = await fetch('https://vercel.com/', {
    headers: {
      cache: 'no-cache',
    },
  })

  return new Response(res.body, {
    headers: {
      // the value should always be 'null'
      'x-original-content-encoding':
        res.headers.get('content-encoding') ?? 'null',
    },
  })
}
