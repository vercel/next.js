export const dynamic = 'force-static'

export function GET() {
  return Response.json({ static: true })
}
