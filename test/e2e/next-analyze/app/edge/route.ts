export const runtime = 'edge'

export function GET() {
  return Response.json({ from: 'edge' })
}
