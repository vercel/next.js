import { testRequestAPIs } from '../helpers'

export const dynamic = 'error'

export async function GET() {
  testRequestAPIs()
  return new Response()
}
