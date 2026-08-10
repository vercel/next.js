import { connection } from 'next/server'

export const instant = false

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        This is a blocking page. It is configured with{' '}
        <code>instant = false</code>, but it's located under a layout with{' '}
        <code>{`instant = { prefetch: 'static' }`}</code>. Ideally, we'd honor
        the static assertion and require that a static shell is produced.
      </p>
    </main>
  )
}
