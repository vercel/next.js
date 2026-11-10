import { connection } from 'next/server'

export default async function Page() {
  await connection()

  return (
    <>
      <p>This page throws an error at runtime in `'use cache'`.</p>
      <ThrowingComponent />
    </>
  )
}

function throwAnError() {
  throw new Error('Kaputt!')
}

async function ThrowingComponent() {
  'use cache: remote'

  throwAnError()

  return null
}
