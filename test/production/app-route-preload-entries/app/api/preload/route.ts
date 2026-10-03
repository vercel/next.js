import fs from 'fs'
import path from 'path'

// `next build` also evaluates this module (to collect route metadata), which
// isn't what this fixture is testing. Only record evaluation when running as
// the actual `next start` server, guarded by the phase `next build` sets on
// itself and propagates to its workers.
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  fs.writeFileSync(
    path.join(process.cwd(), 'preload-marker.json'),
    JSON.stringify({ evaluatedAt: Date.now() })
  )
}

export function GET() {
  return Response.json({ ok: true })
}
