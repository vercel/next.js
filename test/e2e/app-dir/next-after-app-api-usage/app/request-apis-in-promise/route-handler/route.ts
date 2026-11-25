import { testApiInPromisePassedToAfter } from '../common'

export async function GET(request: Request) {
  const apiName = new URL(request.url).searchParams.get('api') as string
  testApiInPromisePassedToAfter('route', apiName)
  return new Response('hello')
}
