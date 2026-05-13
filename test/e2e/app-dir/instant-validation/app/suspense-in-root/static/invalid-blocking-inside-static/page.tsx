import { cookies } from 'next/headers'

export const unstable_instant = false

export default async function BlockingPage() {
  await cookies()
  return (
    <main>
      <p>
        The page is configured as blocking, but the parent layout has an
        assertion, so we'll still perform a validation. This should fail because
        the parent layout does not wrap a suspense around children.
      </p>
    </main>
  )
}
