export async function GET() {
  const upstream = await fetch(
    `http://127.0.0.1:${process.env.TEST_UPSTREAM_PORT}/gzip`,
    {
      cache: 'no-store',
    }
  )
  return new Response(upstream.body, upstream)
}
