'use client'

import React from 'react'
import dynamic from 'next/dynamic'

const DynamicEsmComponent = dynamic(
  () => import('esm-dynamic-import-esm').then((mod) => mod.Component),
  { ssr: false }
)

export default function Page() {
  return <DynamicEsmComponent />
}
