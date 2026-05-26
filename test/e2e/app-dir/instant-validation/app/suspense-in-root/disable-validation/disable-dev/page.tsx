import { connection } from 'next/server'

export const unstable_instant = {
  level: 'experimental-error',
  unstable_disableDevValidation: true,
}

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        This page has <code>unstable_disableDevValidation: true</code>, so
        validation is disabled in dev but runs in build.
      </p>
    </main>
  )
}
