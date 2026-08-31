import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<p>loading</p>}>
      {cookies().then(() => (
        <p>ppr</p>
      ))}
    </Suspense>
  )
}
