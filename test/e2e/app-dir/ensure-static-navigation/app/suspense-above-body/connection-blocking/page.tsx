import { connection } from 'next/server'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <p>
        This page has Suspense above the body, which would normally allow
        blocking the root, but calling
        <code>connection()</code> should still be disallowed by{' '}
        <code>ensureStatic</code>.
      </p>
      <Inner />
    </main>
  )
}

async function Inner() {
  await connection()
  return <p>Dynamic data</p>
}
