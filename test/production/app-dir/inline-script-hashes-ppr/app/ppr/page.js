import { Suspense } from 'react'
import { connection } from 'next/server'

async function Dynamic() {
  await connection()

  return <span id="dynamic">{Date.now()}</span>
}

export default function Page() {
  return (
    <p id="ppr">
      shell
      <Suspense fallback={<span id="fallback">loading</span>}>
        <Dynamic />
      </Suspense>
    </p>
  )
}
