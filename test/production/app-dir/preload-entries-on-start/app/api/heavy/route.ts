export const dynamic = 'force-dynamic'

// A marker observes the cold module evaluation directly, without adding an
// artificial delay or relying on request latency thresholds.
console.log('preload-test:route-evaluated')

export function GET() {
  return Response.json({ ok: true })
}
