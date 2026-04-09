'use client'

import React from 'react'

const isClient = typeof window !== 'undefined'

export default function Mismatch() {
  return (
    <div className="parent">
      <React.Suspense fallback={<p>Loading...</p>}>
        <header className="1" />
        {isClient && <main className="second" />}
        <footer className="3" />
      </React.Suspense>
    </div>
  )
}
