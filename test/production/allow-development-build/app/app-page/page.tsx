'use client'
import React from 'react'

export default function Page() {
  return (
    <div>
      Hello World{' '}
      {typeof window !== 'undefined' && <span>Hydration Error!</span>}
    </div>
  )
}
