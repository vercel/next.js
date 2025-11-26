import { testDraftMode } from '../helpers'

export async function GET() {
  testDraftMode('/draft-mode/route-handler-dynamic')
  return new Response()
}
