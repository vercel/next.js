'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
const Component = dynamic(
  () =>
    import(/* webpackChunkName: "next-dynamic-css-component" */ './component')
)

export default function Inner() {
  return (
    <Suspense>
      <Component />
    </Suspense>
  )
}
