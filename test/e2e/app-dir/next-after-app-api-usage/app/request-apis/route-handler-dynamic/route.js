import { testRequestAPIs } from '../helpers'

export async function GET() {
  testRequestAPIs()
  return new Response()
}
