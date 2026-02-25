import { cookies } from 'next/headers'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{}],
}

// This page HAS runtime prefetch enabled. The sync IO (Date.now()) after
// cookies() is invalid here because during a runtime prefetch, cookies()
// resolves and then Date.now() would abort the prerender too early.

export default async function Page() {
  await cookies()
  const now = Date.now()
  return (
    <main>
      <p>Runtime page with sync IO after cookies: {now}</p>
    </main>
  )
}
