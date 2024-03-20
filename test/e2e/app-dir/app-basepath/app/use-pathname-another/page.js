'use client'

import { Suspense } from 'react'
import { ReadPathName } from '../../components/read-path-name'

export default function Page() {
  return (
    <Suspense>
      <ReadPathName />
    </Suspense>
  )
}
