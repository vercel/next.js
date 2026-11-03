import asset from '../../fixtures/edge.emit'
import mapped from '../../fixtures/asset.mapped'

export const runtime = 'edge'

export function GET() {
  return Response.json({ asset, mapped })
}
