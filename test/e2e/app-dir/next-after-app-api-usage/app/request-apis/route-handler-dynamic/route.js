import { testRequestAPIs } from '../helpers'

export async function GET(request) {
  const requestId = new URL(request.url).searchParams.get('requestId')
  testRequestAPIs('/request-apis/route-handler-dynamic', requestId)
  return new Response()
}
