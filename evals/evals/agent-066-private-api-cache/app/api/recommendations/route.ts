import { getRecommendations } from '@/lib/recs'

export async function GET() {
  const data = await getRecommendations()
  return Response.json(data)
}
