import { testDraftMode } from '../helpers'

export async function GET(request) {
  const requestId = new URL(request.url).searchParams.get('requestId')
  testDraftMode('/draft-mode/route-handler-dynamic', requestId)
  return new Response()
}
