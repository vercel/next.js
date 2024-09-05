'use client'

import React from 'react'

// if (typeof window !== 'undefined') {
console.log(new Worker(new URL('./worker.js', import.meta.url)))
// }

export default function Client() {
  return <h1>Client</h1>
}
