import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { cookies } from 'next/headers'

export async function SyncIO() {
  // Reading the clock before the first dynamic data access is sync IO in a
  // prerender. The build skips it, so only a prerender that the server starts
  // on demand reports it.
  const now = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD ? 0 : Date.now()

  await cookies()

  return <p id="now">{now}</p>
}
