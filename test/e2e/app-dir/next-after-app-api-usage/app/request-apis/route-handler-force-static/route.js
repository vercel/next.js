import { testRequestAPIs } from '../helpers'

export const dynamic = 'force-static'

export async function GET() {
  testRequestAPIs('/request-apis/route-handler-force-static')
  return new Response()
}
