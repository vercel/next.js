import { Instant } from 'next'
import { cookies } from 'next/headers'
import { lang } from 'next/root-params'
import { ensureRejects } from '../../../../ensure-error'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  // no samples
  samples: [{}],
}
export const unstable_prefetch = 'runtime'

export default async function Page() {
  // Guard behind cookies() so that the rest of this component only runs during validation
  await cookies()

  await ensureRejects(
    () => lang(),
    `Expected lang() to error if sample is not provided`
  )
  return (
    <main>
      <p>
        This page uses a root param. It's missing a sample for it, so we can't
        validate it.
      </p>
    </main>
  )
}
