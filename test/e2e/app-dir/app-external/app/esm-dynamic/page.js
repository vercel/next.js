'use client'

import React from 'react'
import dynamic from 'next/dynamic'

const DynamicEsmComponent = dynamic(
  () => import('esm-with-react').then((mod) => mod.Component),
  { ssr: false }
)

export default function Index() {
  return (
    <div>
      <h2 id="esm-dynamic">
        <DynamicEsmComponent />
      </h2>
    </div>
  )
}
