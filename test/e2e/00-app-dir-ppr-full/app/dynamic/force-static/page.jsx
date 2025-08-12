import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export const dynamic = 'force-static'
export const revalidate = 60

export default ({ params: { slug } }) => {
  return (
    <Suspense
      fallback={<Dynamic pathname={`/dynamic/force-static/${slug}`} fallback />}
    >
      <Dynamic pathname={`/dynamic/force-static/${slug}`} />
    </Suspense>
  )
}
