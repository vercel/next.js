export const runtime = 'nodejs'
export const preferredRegion = 'sfo1'
export const maxDuration = 0

export function GET() {
  return Response.json({ runtime: process.env.NEXT_RUNTIME })
}
