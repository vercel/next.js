import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export default ({ params: { slug } }) => {
  return (
    <Suspense fallback={<Dynamic pathname={`/on-demand/${slug}`} fallback />}>
      <Dynamic pathname={`/on-demand/${slug}`} />
    </Suspense>
  )
}
