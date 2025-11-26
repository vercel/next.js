import { serverApi } from 'server-api-esm'

export function GET(req) {
  serverApi(req)
  return new Response('get route')
}
