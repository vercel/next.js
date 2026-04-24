import { connection } from 'next/server'

export const unstable_instant = { level: 'error' }

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        For a statically prefetchable page, Dynamic content needs a Suspense
        boundary, but it's missing here, so we should error
      </p>
    </main>
  )
}
