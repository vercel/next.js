import { Suspense } from 'react'
import { Client } from '../../client'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading params</p>}>
      <Client />
    </Suspense>
  )
}
