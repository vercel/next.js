import { Suspense } from 'react'
import { connection } from 'next/server'
import { ErrorBoundaryFunctions } from './error-boundary-functions'

async function Dynamic() {
  await connection()
  return <ErrorBoundaryFunctions />
}

export default function Page() {
  return (
    <Suspense>
      <Dynamic />
    </Suspense>
  )
}
