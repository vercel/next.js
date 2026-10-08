import { Suspense } from 'react'
import { connection } from 'next/server'
import { getValue } from '../get-value'

async function Value() {
  await connection()
  return <p id="value">{await getValue()}</p>
}

export default function Page() {
  return (
    <Suspense>
      <Value />
    </Suspense>
  )
}
