import { getSentinelValue } from '../../getSentinelValue'

export function GET() {
  return new Response(new Blob([getSentinelValue()]), {
    headers: { 'content-type': 'text/plain' },
  })
}
