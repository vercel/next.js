import { connection } from 'next/server'
import { Suspense } from 'react'

export const ensureStatic = 'navigation'
export const instant = false
export const unstable_paramMatching = { slug: 'blocking' }

export function generateStaticParams() {
  return [{ slug: 'seed' }]
}

export default function Page() {
  return (
    <main>
      <p>Static content</p>
      <Suspense fallback={<p>Loading</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <p>Dynamic content</p>
}
