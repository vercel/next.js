import { Suspense } from 'react'
import { connection } from 'next/server'
import { headers } from 'next/headers'

async function DynamicContent() {
  await connection()
  const token = (await headers()).get('x-resume-contract') || 'no token'
  return (
    <section>
      <p id="dynamic">dynamic content</p>
      <p id="resume-token">{token}</p>
    </section>
  )
}

export default function Page() {
  return (
    <main>
      <p id="shell">static shell</p>
      <Suspense fallback={<p id="fallback">loading</p>}>
        <DynamicContent />
      </Suspense>
    </main>
  )
}
