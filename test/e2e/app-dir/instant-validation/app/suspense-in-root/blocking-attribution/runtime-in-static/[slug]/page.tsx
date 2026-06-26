import { Instant } from 'next'
import { cookies } from 'next/headers'

export const prefetch = 'allow-runtime'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { slug: '123' } }],
}

export default async function Page() {
  await cookies() // Not blocking due to allow-runtime
  return (
    <main>
      <p>
        This page component is valid because it's allow-runtime, but its parent
        layout is static and blocked on runtime data.
      </p>
    </main>
  )
}
