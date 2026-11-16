export const runtime = 'edge'

export function GET() {
  return Response.json({ runtime: process.env.NEXT_RUNTIME })
}
