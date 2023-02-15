import { withRequestMeta } from '../../../helpers'

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)

  return new Response('hello, world', {
    headers: withRequestMeta({
      ping: searchParams.get('ping'),
    }),
  })
}
