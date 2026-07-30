import { Suspense } from 'react'

import { Theme } from '../theme'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Theme />
    </Suspense>
  )
}
