import React from 'react'

export default async function StaticRevalidatePage() {
  'use cache'
  return <h1 id="revalidate-heading">Static ISR Page</h1>
}
