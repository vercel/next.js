export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    finished: Boolean((globalThis as any).instrumentationFinished),
  })
}
