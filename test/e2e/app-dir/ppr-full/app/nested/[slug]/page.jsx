import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export const revalidate = 60

export default async (props) => {
  const params = await props.params

  const { slug } = params

  return (
    <Suspense fallback={<Dynamic pathname={`/nested/${slug}`} fallback />}>
      <Dynamic pathname={`/nested/${slug}`} />
    </Suspense>
  )
}

export const generateStaticParams = async () => {
  return [{ slug: 'a' }]
}
