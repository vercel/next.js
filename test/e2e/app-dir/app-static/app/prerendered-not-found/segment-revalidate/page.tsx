import React from 'react'
import { notFound } from 'next/navigation'

export const revalidate = 3

export default async function Page() {
  await fetch('https://next-data-api.vercel.app/api/random', {
    next: {
      tags: ['explicit-tag'],
    },
  })

  if (process.env.NEXT_PHASE === 'phase-production-build') {
    notFound()
  }

  return (
    <>
      <p>/prerendered-not-found/segment-revalidate</p>
      <p>{Date.now()}</p>
    </>
  )
}
