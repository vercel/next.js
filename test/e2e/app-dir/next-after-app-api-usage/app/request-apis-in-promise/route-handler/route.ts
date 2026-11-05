import { testApiInPromisePassedToAfter } from '../common'

export async function GET(request: Request) {
  const apiName = new URL(request.url).searchParams.get('api') as string
  const requestId = new URL(request.url).searchParams.get('requestId')!
  testApiInPromisePassedToAfter('route', apiName, requestId)
  return new Response('hello')
}
