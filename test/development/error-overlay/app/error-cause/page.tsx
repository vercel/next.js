'use client'

import React from 'react'

export default function Page() {
  const root = new TypeError('Connection refused')
  const mid = new Error('Database query failed', { cause: root })
  console.error(mid)

  return <p>Check Redbox</p>
}
