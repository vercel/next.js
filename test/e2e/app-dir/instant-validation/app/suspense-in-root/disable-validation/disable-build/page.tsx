import { connection } from 'next/server'

export const unstable_instant = {
  prefetch: 'static',
  unstable_disableBuildValidation: true,
}

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        This page has <code>unstable_disableBuildValidation: true</code>, so
        validation is disabled in build but runs in dev.
      </p>
    </main>
  )
}
