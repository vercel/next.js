'use client'

import { Suspense } from 'react'
import { ParamsComponent } from '../../../shared/params-component'

export default function Page() {
  return (
    <Suspense>
      <ParamsComponent />
    </Suspense>
  )
}
