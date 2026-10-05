import { connection } from 'next/server'

// A marker observes the cold module evaluation directly, without adding an
// artificial delay or relying on request latency thresholds.
console.log('preload-test:route-evaluated')

export async function GET() {
  await connection()
  return Response.json({ ok: true })
}
