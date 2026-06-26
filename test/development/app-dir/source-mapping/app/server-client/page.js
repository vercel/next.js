import { Suspense } from 'react'
import { useClient } from './client'

function Component() {
  useClient()

  return <p>Hello, Dave</p>
}
export default function Page() {
  return (
    <Suspense>
      <Component />
    </Suspense>
  )
}
