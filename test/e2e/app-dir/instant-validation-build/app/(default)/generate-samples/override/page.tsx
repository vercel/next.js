import type { Instant } from 'next'
import { cookies } from 'next/headers'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  generateSamples: async () => [
    {
      cookies: [
        {
          name: 'override',
          value: 'child',
        },
      ],
    },
  ],
}

export default async function Page() {
  const cookieStore = await cookies()
  return <p>cookie: {cookieStore.get('override')?.value}</p>
}
