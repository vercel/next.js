import { fetchAndReport } from '../../fetch-and-report'

export async function GET() {
  await fetchAndReport('dynamic-route')
  return new Response('Route fetch metrics')
}
