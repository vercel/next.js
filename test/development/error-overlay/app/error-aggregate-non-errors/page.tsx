'use client'

import React from 'react'

export default function Page() {
  const agg = new AggregateError(
    ['string error', 42, new Error('Real error')],
    'Mixed errors'
  )
  console.error(agg)

  return <p>Check Redbox</p>
}
