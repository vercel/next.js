import { cookies } from 'next/headers'

export async function GET(request) {
  cookies().set('sentinel', 'my sentinel')
  process.env.__TEST_SENTINEL = 'at runtime'
  return new Response('ok')
}
