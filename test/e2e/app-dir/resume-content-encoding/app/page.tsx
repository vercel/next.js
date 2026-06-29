import { cookies } from 'next/headers'
import { Suspense } from 'react'

async function DynamicPart() {
  const store = await cookies()
  return <p id="dynamic">dynamic: {store.get('demo')?.value ?? 'none'}</p>
}

export default function Page() {
  return (
    <main>
      <p id="shell">static shell</p>
      <Suspense fallback={<p id="fallback">loading...</p>}>
        <DynamicPart />
      </Suspense>
    </main>
  )
}
