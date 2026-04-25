import { connection } from 'next/server'

export const unstable_instant = false

export default async function BlockingPage() {
  await connection()
  return (
    <main>
      <p>
        The page is configured as blocking, but the parent layout has an
        assertion, so we'll still perform a validation. This should pass because
        the parent layout wraps a suspense around children.
      </p>
    </main>
  )
}
