import { PHASE_PRODUCTION_BUILD } from 'next/constants'

export function SyncIO() {
  // The build caches a valid page. Revalidation must encounter sync IO.
  const now = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD ? 0 : Date.now()

  return <p id="now">{now}</p>
}
