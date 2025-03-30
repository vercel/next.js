import { testRequestAPIs } from '../helpers'

export const dynamic = 'error'

export async function GET() {
  testRequestAPIs('/request-apis/route-handler-dynamic-error')
  return new Response()
}
