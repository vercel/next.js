import { testRequestAPIs } from '../helpers'

export const dynamic = 'force-static'

export async function GET() {
  testRequestAPIs()
  return new Response()
}
