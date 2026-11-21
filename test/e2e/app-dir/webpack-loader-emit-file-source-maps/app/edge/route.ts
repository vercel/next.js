import mapped from '../../fixture.mapped'

export const runtime = 'edge'

export function GET() {
  return Response.json({ mapped })
}
