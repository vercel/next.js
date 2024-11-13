'use client'
import React from 'react'
import { notFound } from 'next/navigation'

export default function Test({ searchParams }) {
  // const searchParams = useSearchParams()

  if (searchParams['q'] === '404') {
    notFound()
  }

  const id = 'q' in searchParams ? `sp-${searchParams['q']}` : 'no-query'
  return <p id={id}>search param page</p>
}
