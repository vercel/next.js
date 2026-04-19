import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export default async (props) => {
  const params = await props.params

  const { slug } = params

  return (
    <Suspense fallback={<Dynamic pathname={`/on-demand/${slug}`} fallback />}>
      <Dynamic pathname={`/on-demand/${slug}`} />
    </Suspense>
  )
}
