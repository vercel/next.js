import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export const dynamic = 'force-dynamic'

export default () => {
  return (
    <Suspense fallback={<Dynamic pathname="/dynamic/force-dynamic" fallback />}>
      <Dynamic pathname="/dynamic/force-dynamic" />
    </Suspense>
  )
}
