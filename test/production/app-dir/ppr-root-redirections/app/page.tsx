import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

function NameLogger() {
  return <span>{cookies().get('my-name-is')?.value ?? 'what'}</span>
}

function NothingHere() {
  notFound()

  return <span>nothing here</span>
}

export default async function Page() {
  return (
    <>
      <Suspense fallback={<span>Loading...</span>}>
        <NameLogger />
      </Suspense>
      <NothingHere />
    </>
  )
}
