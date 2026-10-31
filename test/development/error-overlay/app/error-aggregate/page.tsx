'use client'

import React from 'react'

export default function Page() {
  const error1 = new Error('Error one')
  const error2 = new TypeError('Error two')
  const agg = new AggregateError([error1, error2], 'Multiple errors occurred')
  console.error(agg)

  return <p>Check Redbox</p>
}
