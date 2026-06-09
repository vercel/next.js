import { Instant } from 'next'
import { cookies } from 'next/headers'
import { lang } from 'next/root-params'
import { ensureRejects } from '../../../../ensure-error'

export const unstable_instant: Instant = {
  level: 'experimental-error',
  // no samples
  unstable_samples: [{}],
}
export const prefetch = 'allow-runtime'

export default async function Page() {
  // Guard behind cookies() so that the rest of this component only runs during validation
  await cookies()

  try {
    await ensureRejects(
      () => lang(),
      `Expected lang() to error if sample is not provided`
    )
  } catch {
    // We swallow the error. It should still be reported and fail the validation.
  }

  return (
    <main>
      <p>
        This page uses a root param. It's missing a sample for it, so we can't
        validate it. It catches the error thrown by the rootparam call, but
        validation should still fail.
      </p>
    </main>
  )
}
