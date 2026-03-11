import { cookies } from 'next/headers'
import { IgnoreServerContent } from './client'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

export default function Page() {
  return (
    <main>
      <p>
        This page passes an erroring server component to a client component that
        ignores it. The error didn't block validation, so the page should pass
        validation.
      </p>
      <IgnoreServerContent content={<Throws />} />
    </main>
  )
}

async function Throws(): Promise<never> {
  await cookies()
  throw new Error('Kaboom')
}
