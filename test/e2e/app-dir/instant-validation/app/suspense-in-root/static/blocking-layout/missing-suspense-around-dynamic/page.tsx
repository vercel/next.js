import { cookies } from 'next/headers'

export const unstable_instant = { prefetch: 'static' }

export default async function Page() {
  await cookies()
  return (
    <main>
      This is a page that uses runtime data without a suspense, so it should
      error the static prefetch assertion even if nested under a
      allowed-blocking layout
    </main>
  )
}
