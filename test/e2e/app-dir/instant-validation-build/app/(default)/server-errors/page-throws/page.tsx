import { cookies } from 'next/headers'

export const unstable_instant = { level: 'experimental-error' }
export const prefetch = 'allow-runtime'

export default function Page() {
  return (
    <main>
      <p>
        This page has an error in a server component with no suspense
        boundaries. It didn't render successfully, so it should be treated as
        blocking validation -- we don't know what content would be rendered if
        the error didn't occur.
      </p>
      <Throws />
    </main>
  )
}

async function Throws(): Promise<never> {
  await cookies()
  throw new Error('Kaboom')
}
