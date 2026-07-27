import { testRequestAPIs } from '../helpers'

export async function GET() {
  testRequestAPIs('/request-apis/route-handler-dynamic')
  return new Response()
}
