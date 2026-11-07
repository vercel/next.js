import { Suspense } from 'react'
import { connection } from 'next/server'

async function throwError() {
  throw new Error('test unhandled rejection')
}

async function UnhandledRejectionLogging() {
  await connection()

  void throwError()
  await Promise.resolve() // Ensure the error is thrown asynchronously

  return <div>Unhandled Rejection Logging</div>
}

export default function Page() {
  return (
    <Suspense>
      <UnhandledRejectionLogging />
    </Suspense>
  )
}
