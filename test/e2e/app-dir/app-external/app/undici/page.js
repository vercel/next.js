import { request } from 'undici'

export default async function Page() {
  const { statusCode } = await request('https://example.com')
  return <div>status: {statusCode}</div>
}

export const dynamic = 'force-dynamic'
