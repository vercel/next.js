import { Suspense } from 'react'
import { BrowserOnly } from '../browser-only/client'

export const instant = false

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BrowserOnly />
    </Suspense>
  )
}
