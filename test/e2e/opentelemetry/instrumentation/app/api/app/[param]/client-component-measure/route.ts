export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const measureName =
  'client-component-loading-test:next-client-component-loading'

export async function DELETE() {
  performance.clearMeasures(measureName)
  return new Response(null, { status: 204 })
}

export async function GET() {
  return Response.json(
    performance
      .getEntriesByName(measureName, 'measure')
      .map((entry) => entry.duration)
  )
}
