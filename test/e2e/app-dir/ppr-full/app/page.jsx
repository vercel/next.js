import React, { Suspense } from 'react'
import { Dynamic } from '../components/dynamic'

export default () => {
  return (
    <Suspense fallback={<Dynamic pathname="/" fallback />}>
      <Dynamic pathname="/" />
    </Suspense>
  )
}
