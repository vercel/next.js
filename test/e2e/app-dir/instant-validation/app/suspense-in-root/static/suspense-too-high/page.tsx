import { cookies } from 'next/headers'

export const unstable_instant = {
  prefetch: 'static',
  samples: [{ cookies: [] }],
}

export default async function Page() {
  await cookies()
  return (
    <main>
      <p>This page blocks when navigating inside the parent layout</p>
    </main>
  )
}
