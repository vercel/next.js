import { cookies } from 'next/headers'

// This page opts out with `false`, but the parent layout has a
// static config. At depths where both are in the new tree, the
// layout's config wins and validation still catches this page's
// blocking cookies() call without Suspense.
export const unstable_instant = false

export default async function Page() {
  await cookies()
  return (
    <main>
      <p>
        This page has unstable_instant = false but the parent layout has
        prefetch: 'static'. The layout's config still triggers validation.
      </p>
    </main>
  )
}
