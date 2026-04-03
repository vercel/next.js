import { connection } from 'next/server'

export const unstable_instant = false

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        This is a blocking page. It is configured with{' '}
        <code>unstable_instant = false</code>, so it should not be required to
        produce a static shell.
      </p>
    </main>
  )
}
