import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export const dynamic = 'force-static'
export const revalidate = 120

export default () => {
  return (
    <Suspense fallback={<Dynamic pathname="/dynamic/force-static" fallback />}>
      <Dynamic pathname="/dynamic/force-static" />
    </Suspense>
  )
}
