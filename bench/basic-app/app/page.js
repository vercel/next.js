import React from 'react'

console.log('page.js loaded')

export default function Page() {
  console.log('page.js rendered')
  return <h1>My Page</h1>
}

export const dynamic = 'force-dynamic'
