import { Suspense } from 'react'
import { connection } from 'next/server'
import ErrorWrapper from './error-wrapper'

export default function Page() {
  return (
    <ErrorWrapper>
      <Suspense>
        <PageImpl />
      </Suspense>
    </ErrorWrapper>
  )
}

async function PageImpl(): Promise<never> {
  await connection()
  // eslint-disable-next-line no-throw-literal -- testing bad values on purpose
  throw null
}
