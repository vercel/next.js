'use client'

import dynamic from 'next/dynamic'

import './nested-outer.css'

const NestedInner = dynamic(() => import('./nested-inner'))

export default function NestedOuter() {
  return (
    <div className="nested-outer">
      <NestedInner />
    </div>
  )
}
