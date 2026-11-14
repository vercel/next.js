import { Suspense } from 'react'
import { cookies } from 'next/headers'

async function Logged() {
  console.log('rendering')
  await cookies()
  return <p>logged</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Logged />
    </Suspense>
  )
}
