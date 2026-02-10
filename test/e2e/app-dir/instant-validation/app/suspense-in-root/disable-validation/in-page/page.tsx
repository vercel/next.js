import { connection } from 'next/server'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
  unstable_disableValidation: true,
}

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        This page opted into runtime prefetching, and is missing a suspense
        boundary around dynamic content, so it should fail validation. However,
        it opted out of validation using <code>unstable_disableValidation</code>
        , so we shouldn't error.
      </p>
    </main>
  )
}
