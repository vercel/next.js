import { testDraftMode } from '../helpers'

export const dynamic = 'force-static'

export async function GET() {
  testDraftMode('/draft-mode/route-handler-static')
  return new Response()
}
