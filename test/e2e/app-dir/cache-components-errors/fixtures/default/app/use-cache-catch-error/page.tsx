import { connection } from 'next/server'

export default async function Page() {
  await connection()

  return (
    <>
      <p>
        This page catches an error that's thrown in `'use cache'` at runtime.
      </p>
      <CatchingComponent />
    </>
  )
}

async function throwAnError() {
  'use cache: remote'

  throw new Error('Kaputt!')
}

async function CatchingComponent() {
  try {
    await throwAnError()
  } catch (error) {
    console.error(error)
  }

  return null
}
