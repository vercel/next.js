import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  cookieStore.set('stale-compressed-framing', '1')
  return fetch(`http://127.0.0.1:${process.env.TEST_UPSTREAM_PORT}/gzip`, {
    cache: 'no-store',
  })
}
