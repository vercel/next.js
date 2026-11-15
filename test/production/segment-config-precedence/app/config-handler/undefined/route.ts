export const runtime = undefined
export const preferredRegion = undefined
export const maxDuration = undefined

export function GET() {
  return Response.json({ runtime: process.env.NEXT_RUNTIME })
}
