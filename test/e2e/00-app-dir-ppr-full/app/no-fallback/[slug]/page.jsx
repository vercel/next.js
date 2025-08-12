import React, { Suspense } from 'react'
import { Dynamic } from '../../../components/dynamic'

export const dynamicParams = false

const slugs = ['a', 'b', 'c']

export function generateStaticParams() {
  return slugs.map((slug) => ({ slug }))
}

export default function NoFallbackPage({ params: { slug } }) {
  return (
    <Suspense fallback={<Dynamic pathname={`/no-fallback/${slug}`} fallback />}>
      <Dynamic pathname={`/no-fallback/${slug}`} />
    </Suspense>
  )
}
