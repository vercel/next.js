import { Suspense } from 'react'
import { cookies } from 'next/headers'

async function Dynamic() {
  const cookieStore = await cookies()
  return <p id="dynamic">{cookieStore.get('token')?.value ?? 'no token'}</p>
}

export default function Page() {
  return (
    <main>
      <p id="static">static shell</p>
      <Suspense fallback={<p id="fallback">loading…</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
