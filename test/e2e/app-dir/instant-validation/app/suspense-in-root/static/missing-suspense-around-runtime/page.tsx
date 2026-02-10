import { cookies } from 'next/headers'

export const unstable_instant = { prefetch: 'static' }

export default async function Page() {
  await cookies()
  return (
    <main>
      <p>
        For a statically prefetchable page, Runtime content needs a Suspense
        boundary, but it's missing here, so we should error
      </p>
    </main>
  )
}
