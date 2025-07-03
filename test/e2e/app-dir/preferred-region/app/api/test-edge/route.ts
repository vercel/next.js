export const runtime = 'edge'
export const preferredRegion = 'iad1'
export const maxDuration = 100

export async function GET() {
  return Response.json({ status: 'success', runtime: 'edge' })
}
