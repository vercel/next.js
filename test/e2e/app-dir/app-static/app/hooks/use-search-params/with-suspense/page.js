import { Suspense } from 'react'
import UseSearchParams from '../search-params'

export default function Page() {
  return (
    <Suspense fallback={<p>search params suspense</p>}>
      <UseSearchParams />
    </Suspense>
  )
}
