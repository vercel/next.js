'use client'

import React from 'react'

export default function Page() {
  const root = new TypeError('Connection refused')
  const error1 = new Error('Database query failed', { cause: root })
  const error2 = new Error('Cache miss')
  const agg = new AggregateError([error1, error2], 'Multiple failures occurred')
  console.error(agg)

  return <p>Check Redbox</p>
}
