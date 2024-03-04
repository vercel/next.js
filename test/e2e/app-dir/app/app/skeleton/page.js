import { cookies } from 'next/headers'
import { Suspense } from 'react'

async function Suspend() {
  await new Promise((resolve) => {
    setTimeout(resolve, 3000)
  })
  cookies()
  return <p>suspended content</p>
}

export default function Page() {
  return (
    <div>
      <Suspense fallback={'Skeleton!!!'}>
        <Suspend />
      </Suspense>
    </div>
  )
}
