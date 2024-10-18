import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export default async (props) => {
  const { slug } = await props.params
  return (
    <Suspense fallback={<Dynamic pathname={`/nested/${slug}`} fallback />}>
      <Dynamic pathname={`/nested/${slug}`} />
    </Suspense>
  )
}

export const generateStaticParams = async () => {
  return [{ slug: 'a' }]
}
