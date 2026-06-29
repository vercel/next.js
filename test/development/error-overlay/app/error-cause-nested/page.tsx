'use client'

import React from 'react'

export default function Page() {
  const root = new TypeError('Connection refused')
  const mid = new Error('Database query failed', { cause: root })
  const top = new Error('Failed to load user', { cause: mid })
  console.error(top)

  return <p>Check Redbox</p>
}
