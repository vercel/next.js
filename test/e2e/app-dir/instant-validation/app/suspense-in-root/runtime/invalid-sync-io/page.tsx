import { cookies } from 'next/headers'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Page() {
  await cookies()
  const now = Date.now()
  return (
    <main>
      <p>This page uses sync IO after awaiting cookies(): {now}</p>
    </main>
  )
}
