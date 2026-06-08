import { cookies } from 'next/headers'

export const unstable_instant = { level: 'experimental-error' }
export const prefetch = 'allow-runtime'

export default async function Page() {
  await cookies()
  const now = Date.now()
  return (
    <main>
      <p>This page uses sync IO after awaiting cookies(): {now}</p>
    </main>
  )
}
