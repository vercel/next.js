import { Suspense } from 'react'
import { Client } from '../../../client'

export const metadata = { title: 'Fallback product' }

export default function Page() {
  return (
    <main>
      <p id="product">Product page</p>
      <Suspense fallback={<p id="loading">Loading params</p>}>
        <Client />
      </Suspense>
    </main>
  )
}
