export const dynamic = 'force-static'

export function GET() {
  return Response.json({ route: 'app prerendered route handler' })
}
