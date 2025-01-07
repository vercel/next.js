import React, { Suspense } from 'react'
import { Dynamic } from '../../../../../components/dynamic'

export const dynamic = 'force-dynamic'

export function generateStaticParams() {
  return []
}

export default async (props) => {
  const params = await props.params

  const { slug } = params

  return (
    <Suspense
      fallback={
        <Dynamic pathname={`/dynamic/force-dynamic/nested/${slug}`} fallback />
      }
    >
      <Dynamic pathname={`/dynamic/force-dynamic/nested/${slug}`} />
    </Suspense>
  )
}
